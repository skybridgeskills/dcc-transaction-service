/**
 * ACCEPTANCE TEST for widening what the verifier accepts.
 *
 * The fixture is generated. `make-acceptance-fixtures.ts` in
 * `src/test-fixtures/` mints it, and reproduces the shape a
 * selective-disclosure presentation arrives in: a derived `ecdsa-sd-2023`
 * credential, issued under a P-256 key published in a `did:web` document,
 * inside a verifiable presentation authenticated by a `did:jwk` holder. That
 * shape is what the widened acceptance has to admit, and it is the whole
 * regression value of these bytes — so the issuer, the holder and the
 * exchange are all simulated, and no other party's identifiers ride along.
 *
 * Each block below names the gate it covers and MUST fail against the
 * pre-fix source:
 *   G1  `at credential[0].proof.created: Required`
 *   G2  `Driver for DID did:jwk:… not found.`
 *   G3  no `ecdsa-sd-2023` suite registered — proof never matched
 *
 * Hermetic: the ONLY network dependency of this verification is the issuer's
 * did:web document, stubbed below. Every JSON-LD context resolves from
 * `security-document-loader`'s bundled static set. The stub throws on any
 * other URL, so the test can never silently start depending on the network.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { DataIntegrityProof } from '@digitalcredentials/data-integrity'
import { Ed25519Signature2020 } from '@digitalcredentials/ed25519-signature-2020'
import * as ecdsaSd2023 from '@digitalbazaar/ecdsa-sd-2023-cryptosuite'
import { verifyCredential, verify } from '@digitalbazaar/vc'
import { buildVerifierDocumentLoader } from './verifier-document-loader.js'
import { parseCredential } from './data/verifiable-credential/schema.js'

const fixture = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../test-fixtures/${name}`, import.meta.url), 'utf8')
  )

const vp = fixture('ecdsa-sd-2023-derived-vp.sample.json')
const didWebDocument = fixture('simulated-issuer-did-web.json')
const DID_WEB_URL = 'https://issuer.example.com/.well-known/did.json'

const credential = Array.isArray(vp.verifiableCredential)
  ? vp.verifiableCredential[0]
  : vp.verifiableCredential

/** No-op: status is owned by the status suite, not by the proof path. */
const checkStatus = async () => ({ verified: true, results: [] })

/**
 * `HttpGetService` seam for contexts and status lists. Nothing should reach
 * it — the bundled static contexts cover this credential — so it throws
 * rather than fetching, which turns any new remote dependency into a test
 * failure instead of a silent network call.
 */
const httpGetService = {
  get: async (url: string) => {
    throw new Error(`unexpected remote document load: ${url}`)
  }
} as never

const documentLoader = buildVerifierDocumentLoader(httpGetService)

let realFetch: typeof globalThis.fetch

beforeAll(() => {
  realFetch = globalThis.fetch
  // The stock DidWebDriver fetches through `http-client`, not through
  // `httpGetService` — see the caching note in verifier-document-loader.ts.
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String((input as Request).url ?? input)
    if (url === DID_WEB_URL) {
      return new Response(JSON.stringify(didWebDocument), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }
    throw new Error(`unexpected network fetch: ${url}`)
  }) as typeof globalThis.fetch
})

afterAll(() => {
  globalThis.fetch = realFetch
})

describe('verifier acceptance — ecdsa-sd-2023 derived-proof replay', () => {
  test('G1: a derived proof with no `created` parses', () => {
    expect(credential.proof.cryptosuite).toBe('ecdsa-sd-2023')
    expect(credential.proof.created).toBeUndefined()

    const result = parseCredential(credential, 'credential[0]')
    expect(result.success).toBe(true)
  })

  test('G2: the did:jwk holder resolves and the VP authenticates', async () => {
    expect(vp.holder).toMatch(/^did:jwk:/)
    expect(vp.proof.verificationMethod).toMatch(/^did:jwk:/)

    const result = await verify({
      presentation: vp,
      suite: new Ed25519Signature2020(),
      challenge: vp.proof.challenge,
      domain: vp.proof.domain,
      documentLoader,
      checkStatus
    })

    expect(result.presentationResult?.verified).toBe(true)
  })

  test('G3: the ecdsa-sd-2023 derived credential proof verifies', async () => {
    const result = await verifyCredential({
      credential,
      suite: new DataIntegrityProof({
        cryptosuite: ecdsaSd2023.createVerifyCryptosuite()
      }),
      documentLoader,
      checkStatus
    })

    expect(result.verified).toBe(true)
  })

  test('the derivation is real — withheld fields are absent', () => {
    // A derived proof that returned the whole credential would prove nothing
    // about selective disclosure. `validFrom` is present in the base
    // credential and withheld here, and the subject is narrowed to the four
    // terms below — that narrowing is the behaviour this file exists to
    // check. (`id` is absent from the base credential as well: the selection
    // algorithm copies a root node's `id` into every derivation, so a
    // top-level `id` cannot be withheld by any choice of pointers. The
    // generator says so at greater length.)
    expect(credential.id).toBeUndefined()
    expect(credential.validFrom).toBeUndefined()
    expect(Object.keys(credential.credentialSubject).sort()).toEqual([
      'achievement',
      'id',
      'result',
      'type'
    ])
  })
})

describe('verifier acceptance — the advertised acceptance equals the actual acceptance', () => {
  test('every advertised cryptosuite has a verifying suite', async () => {
    const { VERIFIABLE_CRYPTOSUITES } = await import(
      './verifiable-cryptosuites.js'
    )
    const { verifyingSuites } = await import('./verifier-crypto-suites.js')

    // `Ed25519Signature2020` is a legacy LDP suite identified by its `type`;
    // Data Integrity suites are identified by `cryptosuite`. The VPR
    // advertises both kinds in one list, so match on either.
    const verifiable = new Set(
      verifyingSuites().flatMap((s) => {
        const suite = s as { type: string; cryptosuite?: string }
        return suite.cryptosuite
          ? [suite.type, suite.cryptosuite]
          : [suite.type]
      })
    )

    const unbacked = VERIFIABLE_CRYPTOSUITES.map((c) => c.cryptosuite).filter(
      (name) =>
        !verifiable.has(name) &&
        !verifiable.has(
          name
            .split('-')
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join('')
        )
    )

    // This is the whole point of the acceptance work: advertising a suite we
    // cannot verify makes a conformant wallet fail for our gap.
    // `ecdsa-rdfc-2019` sat in this list unbacked.
    expect(unbacked).toEqual([])
  })

  test('a P-256 did:key resolves — SD fixture issuer', async () => {
    // Regression guard for the `zDna` multikey header. The derived
    // credential above verifies WITHOUT it (its P-256 key is published in a
    // did:web document and decoded by the cryptosuite), so nothing else in
    // this file would catch its removal — but the VC Playground
    // selective-disclosure fixture is issued by a P-256 did:key, which cannot
    // resolve at all without it.
    const p256 = 'did:key:zDnaerDaTF5BXEavCrfRZEk316dpbLsfPDZ3WJ5hRTPFU2169'
    const resolved = await documentLoader(
      `${p256}#${p256.slice('did:key:'.length)}`
    )
    expect(resolved.document).toBeTruthy()
  })

  test('ecdsa-sd-2023 is verifiable but deliberately not advertised', async () => {
    const { VERIFIABLE_CRYPTOSUITES } = await import(
      './verifiable-cryptosuites.js'
    )
    const { verifyingSuites } = await import('./verifier-crypto-suites.js')

    expect(
      verifyingSuites().some(
        (s) => (s as { cryptosuite?: string }).cryptosuite === 'ecdsa-sd-2023'
      )
    ).toBe(true)
    // Advertising it would invite EVERY wallet to derive, which would
    // silently change what every exchange observes. ⚠️ No per-exchange knob can
    // extend that invitation either, so this assertion is the whole story
    // rather than half of it.
    // Cast: the const's literal union already makes this impossible to get
    // wrong at compile time, which is the strongest form of the guarantee.
    // The runtime check remains so that widening the const trips here too.
    const advertised: string[] = VERIFIABLE_CRYPTOSUITES.map(
      (c) => c.cryptosuite
    )
    expect(advertised).not.toContain('ecdsa-sd-2023')
  })

  test('the advertised methods are DID Method NAMES, per the VP Request spec', async () => {
    // The sibling test below checks our strings against OUR resolver, so it
    // passes happily on malformed ones — and it propagated `did:jwk` in the
    // wrong shape while adding it. This one checks the strings against the
    // SPEC, which is the only side that a wallet reads.
    //
    // https://w3c-ccg.github.io/vp-request-spec/ — `acceptedMethods` carries
    // a DID Method name (`key`), not a DID scheme-plus-method (`did:key`).
    // A shipped verifier compares `name == "key"`, matches nothing against
    // our form, and refuses before signing. Malformed since d4a81db,
    // 2026-03-17.
    const { getVerifyVPR } = await import('../workflows/verifyWorkflow.js')

    const exchange = {
      exchangeId: 'acceptance-test',
      variables: {
        challenge: 'c',
        exchangeHost: 'https://example.org',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential'],
        vprClaims: []
      }
    } as never

    const vpr = getVerifyVPR(exchange)
    const didAuth = vpr.query.find(
      (q: { type: string }) => q.type === 'DIDAuthentication'
    ) as { acceptedMethods: { method: string }[] }

    // did-core ABNF: method-name = 1*method-char, method-char = %x61-7A /
    // DIGIT. A `did:` prefix fails this, and so does any uppercase or
    // punctuation.
    const METHOD_NAME = /^[a-z0-9]+$/

    const malformed = didAuth.acceptedMethods
      .map(({ method }) => method)
      .filter((name) => !METHOD_NAME.test(name))

    expect(
      malformed,
      'acceptedMethods must carry bare DID Method names'
    ).toEqual([])

    // Named explicitly so the fix cannot be "drop the list".
    expect(didAuth.acceptedMethods).toEqual([
      { method: 'key' },
      { method: 'web' },
      { method: 'jwk' }
    ])
  })

  test('every DID method the VPR advertises actually resolves', async () => {
    const { getVerifyVPR } = await import('../workflows/verifyWorkflow.js')

    const exchange = {
      exchangeId: 'acceptance-test',
      variables: {
        challenge: 'c',
        exchangeHost: 'https://example.org',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential'],
        vprClaims: []
      }
    } as never

    const vpr = getVerifyVPR(exchange)
    const didAuth = vpr.query.find(
      (q: { type: string }) => q.type === 'DIDAuthentication'
    ) as { acceptedMethods: { method: string }[] }

    expect(didAuth.acceptedMethods).toContainEqual({ method: 'jwk' })

    // The coupling that matters. Advertising a method the loader cannot
    // resolve invites a presentation we will then fail — the same shape of
    // defect as advertising an unverifiable cryptosuite. Resolve one real
    // DID per advertised method; `did:jwk` and `did:key` are local, and
    // `did:web` is served by the stubbed fetch above.
    // Keyed by DID Method name, matching the wire form the spec requires.
    const resolvable: Record<string, string> = {
      key: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
      web: 'did:web:issuer.example.com#key-1',
      jwk: vp.proof.verificationMethod
    }

    for (const { method } of didAuth.acceptedMethods) {
      const url = resolvable[method]
      expect(
        url,
        `no resolvable DID for advertised method ${method}`
      ).toBeDefined()
      const resolved = await documentLoader(url)
      expect(resolved.document, `${method} did not resolve`).toBeTruthy()
    }
  })
})
