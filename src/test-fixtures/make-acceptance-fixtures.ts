/**
 * Generates the two signed fixtures that `src/lib/verifier-acceptance.test.ts`
 * verifies:
 *
 *   - `simulated-issuer-did-web.json`        — the issuer's did:web document
 *   - `ecdsa-sd-2023-derived-vp.sample.json` — a derived `ecdsa-sd-2023`
 *     credential inside a VP authenticated by a `did:jwk` holder
 *
 * Run by hand, and commit what it writes:
 *
 *   npx tsx src/test-fixtures/make-acceptance-fixtures.ts
 *
 * WHY A GENERATOR RATHER THAN A CAPTURE. These bytes reproduce the *shape* a
 * selective-disclosure presentation arrives in — that shape is what the
 * verifier has to accept, and it is the whole regression value of the fixture.
 * A capture would carry a third party's issuer DID, host names, status-list
 * URLs and exchange identifiers into a public repository for no additional
 * coverage. Every identifier below is simulated, on a domain reserved for
 * documentation.
 *
 * NOT REPRODUCIBLE BYTE-FOR-BYTE. `ecdsa-sd-2023` signs each non-mandatory
 * statement with a freshly generated local key and blinds blank-node labels
 * with a fresh HMAC key, so two runs never agree. The fixture is the artifact;
 * this file is the record of how it was made.
 *
 * THE SHAPE THIS FILE HAS TO PRODUCE — each is asserted by the test:
 *
 *   G1  the credential's proof carries NO `created`. `date: null` on the
 *       signing `DataIntegrityProof` suppresses it, and the disclosure proof
 *       is a shallow copy of the base proof, so the omission survives
 *       derivation.
 *   G2  the VP's `proof.verificationMethod` is a `did:jwk:` URL.
 *   G3  the credential proof is `ecdsa-sd-2023` and verifies under
 *       `createVerifyCryptosuite()`.
 *   the derivation is real
 *       `id` and `validFrom` are absent from the derived credential and the
 *       derived `credentialSubject` has exactly
 *       `['achievement', 'id', 'result', 'type']`.
 *
 *       ⚠️ The base credential deliberately has NO top-level `id`.
 *       `selectJsonLd` (di-sd-primitives) copies the root node's `id` and
 *       `type` into every derivation unconditionally, so a base `id` cannot
 *       be withheld by any choice of pointers. `validFrom` is an ordinary
 *       literal and IS withheld — it is present in the base below and absent
 *       from the output.
 *
 * HERMETIC. The only network-shaped dependency is the issuer's did:web
 * document, which the test stubs; `httpGetService` throws here for the same
 * reason it throws there. Every JSON-LD context used is in
 * `security-document-loader`'s bundled static set.
 */
import { writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import * as EcdsaMultikey from '@digitalbazaar/ecdsa-multikey'
import * as Ed25519Multikey from '@digitalcredentials/ed25519-multikey'
import * as didJwk from '@digitalbazaar/did-method-jwk'
import { DataIntegrityProof } from '@digitalcredentials/data-integrity'
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020'
import * as ecdsaSd2023 from '@digitalbazaar/ecdsa-sd-2023-cryptosuite'
import { issue, derive, signPresentation } from '@digitalbazaar/vc'
import { buildVerifierDocumentLoader } from '../lib/verifier-document-loader.js'

/** A domain reserved for documentation — it resolves for nobody. */
const ISSUER_HOST = 'issuer.example.com'
const ISSUER_DID = `did:web:${ISSUER_HOST}`
const ISSUER_KEY_ID = `${ISSUER_DID}#key-1`
const DID_WEB_URL = `https://${ISSUER_HOST}/.well-known/did.json`

const VERIFIER_HOST = 'verifier.example.com'

const out = (name: string) => new URL(`./${name}`, import.meta.url)
const writeJson = (name: string, value: unknown) =>
  writeFileSync(out(name), `${JSON.stringify(value, null, 2)}\n`, 'utf8')

/** Nothing may be fetched while generating, exactly as in the test. */
const httpGetService = {
  get: async (url: string) => {
    throw new Error(`unexpected remote document load: ${url}`)
  }
} as never

const documentLoader = buildVerifierDocumentLoader(httpGetService)

// ---------------------------------------------------------------------------
// 1. The simulated issuer: a P-256 multikey published as a did:web document.
// ---------------------------------------------------------------------------

const issuerKey = await EcdsaMultikey.generate({
  curve: 'P-256',
  id: ISSUER_KEY_ID,
  controller: ISSUER_DID
})

const issuerDidDocument = {
  '@context': [
    'https://www.w3.org/ns/did/v1',
    'https://w3id.org/security/multikey/v1'
  ],
  id: ISSUER_DID,
  verificationMethod: [
    {
      id: ISSUER_KEY_ID,
      type: 'Multikey',
      controller: ISSUER_DID,
      publicKeyMultibase: issuerKey.publicKeyMultibase
    }
  ],
  authentication: [],
  assertionMethod: [ISSUER_KEY_ID]
}

writeJson('simulated-issuer-did-web.json', issuerDidDocument)

// The did:web driver reaches the network through `fetch`, not through
// `httpGetService` — see the caching note in verifier-document-loader.ts.
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = String((input as Request).url ?? input)
  if (url === DID_WEB_URL) {
    return new Response(JSON.stringify(issuerDidDocument), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })
  }
  throw new Error(`unexpected network fetch: ${url}`)
}) as typeof globalThis.fetch

// ---------------------------------------------------------------------------
// 2. The simulated holder: an Ed25519 key expressed as did:jwk.
// ---------------------------------------------------------------------------

const holderKey = await Ed25519Multikey.generate()
const holderJwk = await Ed25519Multikey.toJwk({ keyPair: holderKey })
const { didDocument: holderDidDocument } = await didJwk
  .driver()
  .fromJwk({ jwk: holderJwk })
const HOLDER_DID: string = holderDidDocument.id
const HOLDER_KEY_ID = `${HOLDER_DID}#0`
holderKey.id = HOLDER_KEY_ID
holderKey.controller = HOLDER_DID

// ---------------------------------------------------------------------------
// 3. The base credential. No top-level `id` (see the header note); `validFrom`
//    is present here and withheld by the derivation.
// ---------------------------------------------------------------------------

const ACHIEVEMENT_ID = `urn:uuid:${randomUUID()}`

const baseCredential = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  issuer: {
    type: 'Profile',
    id: ISSUER_DID,
    name: 'Simulated Issuer'
  },
  validFrom: '2026-01-01T00:00:00Z',
  credentialStatus: {
    id: `https://${ISSUER_HOST}/statuses/1/status-lists/1#4242`,
    type: 'BitstringStatusListEntry',
    statusPurpose: 'revocation',
    statusListIndex: '4242',
    statusListCredential: `https://${ISSUER_HOST}/statuses/1/status-lists/1`
  },
  credentialSubject: {
    id: HOLDER_DID,
    type: 'AchievementSubject',
    achievement: {
      id: ACHIEVEMENT_ID,
      type: 'Achievement',
      achievementType: 'Competency',
      name: 'Introductory Data Literacy',
      description:
        'Reads a small dataset, states what it does and does not support, and explains the difference.',
      criteria: {
        narrative:
          'Completes a guided analysis of a sample dataset and writes up its limitations.'
      }
    },
    result: [
      {
        type: 'Result',
        status: 'Completed'
      }
    ]
  }
}

// `/issuer` and `/credentialStatus` are disclosed to everyone the credential
// is ever shown to; the achievement and the result are the holder's to
// release. `/credentialSubject/{id,type}` ride along with any subject pointer
// — `selectJsonLd` copies a node's `id` and `type` whenever it selects into
// that node — which is what makes the derived subject exactly
// `['achievement', 'id', 'result', 'type']`.
const mandatoryPointers = ['/issuer', '/credentialStatus']
const selectivePointers = [
  '/credentialSubject/achievement',
  '/credentialSubject/result'
]

// `date: null` is G1: it suppresses `proof.created` on the base proof, and
// the disclosure proof is a shallow copy of it.
const signedBaseCredential = await issue({
  credential: baseCredential,
  suite: new DataIntegrityProof({
    signer: issuerKey.signer(),
    date: null,
    cryptosuite: ecdsaSd2023.createSignCryptosuite({ mandatoryPointers })
  }),
  documentLoader
})

const derivedCredential = await derive({
  verifiableCredential: signedBaseCredential,
  suite: new DataIntegrityProof({
    cryptosuite: ecdsaSd2023.createDiscloseCryptosuite({ selectivePointers })
  }),
  documentLoader
})

// ---------------------------------------------------------------------------
// 4. The presentation, authenticated by the did:jwk holder.
// ---------------------------------------------------------------------------

const challenge = randomUUID()
const domain = `redirect_uri:https://${VERIFIER_HOST}/workflows/verify/exchanges/${randomUUID()}/openid4vp/response`

const presentation = {
  '@context': [
    'https://www.w3.org/ns/credentials/v2',
    'https://w3id.org/security/suites/ed25519-2020/v1'
  ],
  type: ['VerifiablePresentation'],
  id: `urn:uuid:${randomUUID()}`,
  holder: HOLDER_DID,
  verifiableCredential: [derivedCredential]
}

const signedPresentation = await signPresentation({
  presentation,
  suite: new Ed25519Signature2020({ key: holderKey }),
  challenge,
  domain,
  documentLoader
})

writeJson('ecdsa-sd-2023-derived-vp.sample.json', signedPresentation)

globalThis.fetch = realFetch

// A generator that silently produced the wrong shape would be worse than no
// generator, so restate what was written.
const subject = derivedCredential.credentialSubject
console.log('wrote src/test-fixtures/simulated-issuer-did-web.json')
console.log('wrote src/test-fixtures/ecdsa-sd-2023-derived-vp.sample.json')
console.log({
  'G1 proof.created absent': derivedCredential.proof.created === undefined,
  'G2 did:jwk verificationMethod': String(
    signedPresentation.proof.verificationMethod
  ).startsWith('did:jwk:'),
  'G3 cryptosuite': derivedCredential.proof.cryptosuite,
  'credential.id absent': derivedCredential.id === undefined,
  'credential.validFrom absent': derivedCredential.validFrom === undefined,
  'credentialSubject keys': Object.keys(subject).sort()
})
