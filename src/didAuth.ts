// @ts-nocheck // Digital Bazaar VC signing APIs are loosely typed
import { signPresentation, createPresentation } from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { securityLoader } from '@digitalcredentials/security-document-loader'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
import { verifyPresentation } from '@digitalcredentials/verifier-core'
import type { CheckResult } from '@digitalcredentials/verifier-core'
import { preparePresentation } from './verifiablePresentation.js'
import {
  cryptographicVerificationProblemDetail,
  type ProblemDetail
} from './lib/errors/problem-details.js'
import { getVerifierVerificationFetchers } from './lib/verifier-keyv-store.js'

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
  | { verified: true }
  | { verified: false; problemDetails: ProblemDetail[] }

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

export const verifyDIDAuth = async ({
  presentation,
  challenge
}: {
  presentation: unknown
  challenge: string
}): Promise<DidAuthVerificationResult> => {
  const refinedPresentation = preparePresentation(
    presentation as Record<string, unknown>
  )

  const { httpGet, cache } = getVerifierVerificationFetchers()
  const result = await verifyPresentation({
    presentation: refinedPresentation,
    challenge,
    httpGet,
    cache
  })

  if (result.verified) {
    return { verified: true }
  }

  const problemDetails = problemDetailsFromChecks(result.allResults)
  if (problemDetails.length === 0) {
    problemDetails.push(
      cryptographicVerificationProblemDetail(
        'DID Authentication presentation could not be verified.'
      )
    )
  }

  return { verified: false, problemDetails }
}
