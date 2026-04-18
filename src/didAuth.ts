// @ts-nocheck // Digital Bazaar VC signing APIs are loosely typed
import { signPresentation, createPresentation } from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { securityLoader } from '@digitalcredentials/security-document-loader'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
import { verifyPresentation } from '@digitalcredentials/verifier-core'
import type { CheckResult } from '@digitalcredentials/verifier-core'
import {
  cryptographicVerificationProblemDetail,
  type ProblemDetail
} from './lib/errors/problem-details.js'
import { getVerifierVerificationFetchers } from './lib/verifier-keyv-store.js'
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

export type DidAuthVerificationResult =
  | { verified: true; allResults?: CheckResult[] }
  | {
      verified: false
      problemDetails: ProblemDetail[]
      allResults?: CheckResult[]
    }

function problemDetailsFromChecks(allResults: CheckResult[]): ProblemDetail[] {
  const out: ProblemDetail[] = []
  for (const check of allResults) {
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
 * When `debug === true`, the returned object includes `allResults`:
 * compatibility-fix log entries followed by verifier-core's check results.
 * When `debug` is false (the default), `allResults` is omitted.
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
  const compatLog: CheckResult[] = []
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

  const { httpGetService, cacheService } = getVerifierVerificationFetchers()
  const result = await verifyPresentation({
    presentation: refinedPresentation,
    challenge,
    httpGetService,
    cacheService
  })

  const allResults = debug
    ? [...compatLog, ...result.allResults]
    : undefined

  if (result.verified) {
    return allResults ? { verified: true, allResults } : { verified: true }
  }

  const problemDetails = problemDetailsFromChecks(result.allResults)
  if (problemDetails.length === 0) {
    problemDetails.push(
      cryptographicVerificationProblemDetail(
        'DID Authentication presentation could not be verified.'
      )
    )
  }

  return allResults
    ? { verified: false, problemDetails, allResults }
    : { verified: false, problemDetails }
}
