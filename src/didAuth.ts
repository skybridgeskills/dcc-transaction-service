// @ts-nocheck // There are no type definitions for these digitalbazaar libraries
import { verify, signPresentation, createPresentation } from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { securityLoader } from '@digitalcredentials/security-document-loader'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'
import { DataIntegrityProof } from '@digitalbazaar/data-integrity'
import { documentLoader } from './documentLoader'
import { cryptosuite as ecdsaRdfc2019Cryptosuite } from '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite'
import { cryptosuite as eddsaRdfc2022Cryptosuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite'
import { preparePresentation } from './verifiablePresentation'
import { suites as verificationSuite } from './suites'

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

export const verifyDIDAuth = async ({
  presentation,
  challenge
}: {
  presentation: unknown
  challenge: string
}) => {
  const refinedPresentation = preparePresentation(presentation)

  const result = await verify({
    presentation: refinedPresentation,
    challenge,
    suite: verificationSuite,
    documentLoader
  })
  return result.verified
}
