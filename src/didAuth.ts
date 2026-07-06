// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck -- Digital Bazaar VC signing APIs are loosely typed
import { signPresentation, createPresentation } from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { securityLoader } from '@digitalcredentials/security-document-loader'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
import {
  cryptographicVerificationProblemDetail,
  type ProblemDetail
} from './lib/errors/problem-details.js'
import { getVerifier } from './lib/verifier.js'
import { applyFix } from './compatibility/apply.js'
import { prepareVcalmParticipationMessage } from './compatibility/vcalm-participation-message/index.js'
import { prepareVerifiableEntity } from './compatibility/verifiable-entity/index.js'
import { assertValidVerifiablePresentationStructure } from './lib/data/verifiable-presentation/assert.js'

const signingDocumentLoader = securityLoader().build()

let key: Ed25519VerificationKey2020
let suite: Ed25519Signature2020

export const initializeKeyAndSuite = async () => {
  // Test key and suite for health check and unit tests
  key = await Ed25519VerificationKey2020.generate({
    seed: new Uint8Array([
      217, 87, 166, 30, 75, 106, 132, 55, 32, 120, 171, 23, 116, 73, 254, 74,
      230, 16, 127, 91, 2, 252, 224, 96, 184, 172, 245, 157, 58, 217, 91, 240
    ]),
    controller: 'did:key:z6MkvL5yVCgPhYvQwSoSRQou6k6ZGfD5mNM57HKxufEXwfnP'
  })
  suite = new Ed25519Signature2020({ key })
}

// Helper funtion for health check and unit tests
export const getSignedDIDAuth = async (
  challenge: string,
  customHolder: string | undefined = undefined
) => {
  await initializeKeyAndSuite()
  const holder = customHolder ?? key?.controller
  const presentation = createPresentation({ holder })
  return await signPresentation({
    presentation,
    suite,
    challenge,
    documentLoader: signingDocumentLoader
  })
}

/**
 * `compatLog` carries the synthetic CheckResult entries emitted by the
 * compatibility-fix pipeline. With verifier-core 2.x the verifier's own
 * folded results live in the regular `presentationResults` /
 * `credentialResults` arrays and no longer need to be duplicated into a
 * debug-only side-channel; this field surfaces the small set of
 * compat-fix log entries (e.g. envelope wrapping, Ed25519Signature2020
 * context injection) that callers may want to inspect when `debug` mode
 * is enabled.
 */
export type DidAuthVerificationResult =
  | { verified: true; holder?: string; compatLog?: App.CheckResult[] }
  | {
      verified: false
      problemDetails: ProblemDetail[]
      compatLog?: App.CheckResult[]
    }

/**
 * Derive the *cryptographically bound* holder DID from a verified
 * presentation: the controller of the signing key, i.e. the DID portion
 * (before the `#` fragment) of the authentication proof's
 * `verificationMethod`.
 *
 * This is deliberately NOT the top-level `holder` field — no verifier layer
 * (verifier-core → `@digitalcredentials/vc` → jsonld-signatures) checks that
 * `holder` matches the signer, so `holder` is fully self-asserted. Callers
 * that issue credentials MUST bind the subject to this value.
 *
 * When several proofs are present, prefer the `authentication` proof (or the
 * one carrying the challenge) — that is the DIDAuth proof.
 */
const deriveHolderFromProof = (
  presentation: Record<string, unknown>,
  challenge: string
): string | undefined => {
  const isObj = (p: unknown): p is Record<string, unknown> =>
    !!p && typeof p === 'object'
  const proof = (presentation as { proof?: unknown }).proof
  const proofs = Array.isArray(proof) ? proof : proof ? [proof] : []
  const auth =
    proofs.find((p) => isObj(p) && p.proofPurpose === 'authentication') ??
    proofs.find((p) => isObj(p) && p.challenge === challenge) ??
    proofs[0]
  if (!isObj(auth)) return undefined
  const vm = auth.verificationMethod
  if (typeof vm !== 'string' || vm.length === 0) return undefined
  const hashIndex = vm.indexOf('#')
  return hashIndex === -1 ? vm : vm.slice(0, hashIndex)
}

function problemDetailsFromChecks(
  results: ReadonlyArray<{ outcome: App.CheckResult['outcome'] }>
): ProblemDetail[] {
  const out: ProblemDetail[] = []
  for (const check of results) {
    if (check.outcome.status === 'failure') {
      for (const p of check.outcome.problems) {
        out.push(
          cryptographicVerificationProblemDetail(`${p.title}: ${p.detail}`)
        )
      }
    }
  }
  return out
}

/**
 * Verify a wallet-submitted DID Authentication presentation.
 *
 * Applies the same per-object compatibility fixes used by the verify
 * workflow (envelope wrapping, Ed25519Signature2020 context injection) and
 * passes the **raw** post-compat presentation to verifier-core so the
 * cryptographic proof verifies against the byte-equivalent payload the
 * wallet signed.
 *
 * Throws `HTTPException(400)` when the post-compat object isn't a
 * structurally valid Verifiable Presentation. Cryptographic verification
 * failures are returned as `{ verified: false, problemDetails }` rather
 * than thrown, so callers can map them to the appropriate response code
 * (e.g. `401` for the DID-Auth and claim flows).
 *
 * When `debug === true`, the returned object includes `compatLog`:
 * the compatibility-fix log entries (verifier-core's own checks are
 * available via the standard `presentationResults` shape). When `debug`
 * is false (the default), `compatLog` is omitted.
 */
export const verifyDIDAuth = async ({
  presentation,
  challenge,
  debug = false
}: {
  presentation: unknown
  challenge: string
  debug?: boolean
}): Promise<DidAuthVerificationResult> => {
  const compatLog: App.CheckResult[] = []
  const message = applyFix(
    prepareVcalmParticipationMessage(presentation as Record<string, unknown>),
    compatLog
  )
  const refinedPresentation = applyFix(
    prepareVerifiableEntity(
      (message.verifiablePresentation ?? message) as Record<string, unknown>
    ),
    compatLog
  )

  // Defensive structural validation — THROWS HTTPException(400) on bad
  // shape; the parsed value is intentionally discarded so it cannot be
  // passed to verifier-core in place of the raw signed object (see
  // assert.ts JSDoc on JsonLdField mutation and signature canonicalization).
  assertValidVerifiablePresentationStructure(refinedPresentation)

  const result = await getVerifier().verifyPresentation({
    presentation: refinedPresentation,
    challenge
  })

  const verifierChecks = result.presentationResults
  const exposed = debug ? compatLog : undefined

  if (result.verified) {
    const holder = deriveHolderFromProof(refinedPresentation, challenge)
    return {
      verified: true,
      ...(holder ? { holder } : {}),
      ...(exposed ? { compatLog: exposed } : {})
    }
  }

  const problemDetails = problemDetailsFromChecks(verifierChecks)
  if (problemDetails.length === 0) {
    problemDetails.push(
      cryptographicVerificationProblemDetail(
        'DID Authentication presentation could not be verified.'
      )
    )
  }

  return exposed
    ? { verified: false, problemDetails, compatLog: exposed }
    : { verified: false, problemDetails }
}
