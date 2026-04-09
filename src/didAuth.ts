// @ts-nocheck // There are no type definitions for these digitalbazaar libraries
import { verify, signPresentation, createPresentation } from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { securityLoader } from '@digitalcredentials/security-document-loader'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
import { DataIntegrityProof } from '@digitalbazaar/data-integrity'
import { documentLoader } from './documentLoader.js'
import { cryptosuite as ecdsaRdfc2019Cryptosuite } from '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite'
import { cryptosuite as eddsaRdfc2022Cryptosuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite'
import { preparePresentation } from './verifiablePresentation.js'
import { suites as verificationSuite } from './suites.js'
import {
  cryptographicVerificationProblemDetail,
  type ProblemDetail
} from './lib/errors/problem-details.js'

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
    documentLoader
  })
}

export type DidAuthVerificationResult =
  | { verified: true }
  | { verified: false; problemDetails: ProblemDetail[] }

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

  const result = await verify({
    presentation: refinedPresentation,
    challenge,
    suite: verificationSuite,
    documentLoader
  })
  if (result.verified) {
    return { verified: true }
  }

  const errors = (
    result as { error?: { errors?: Array<{ name: string; message: string }> } }
  ).error?.errors
  const problemDetails: ProblemDetail[] =
    errors && errors.length > 0
      ? errors.map((e) =>
          cryptographicVerificationProblemDetail(`${e.name}: ${e.message}`)
        )
      : [
          cryptographicVerificationProblemDetail(
            'DID Authentication presentation could not be verified.'
          )
        ]

  return { verified: false, problemDetails }
}
