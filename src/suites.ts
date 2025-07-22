// @ts-ignore// There are no type definitions for these digitalbazaar librariesimport { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { DataIntegrityProof } from '@digitalbazaar/data-integrity'
// @ts-ignore
import { cryptosuite as ecdsaRdfc2019Cryptosuite } from '@digitalbazaar/ecdsa-rdfc-2019-cryptosuite'
// @ts-ignore
import { cryptosuite as eddsaRdfc2022Cryptosuite } from '@digitalbazaar/eddsa-rdfc-2022-cryptosuite'
// @ts-ignore
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'

export const suites = [
  new Ed25519Signature2020(),
  new DataIntegrityProof({ cryptosuite: ecdsaRdfc2019Cryptosuite }),
  new DataIntegrityProof({ cryptosuite: eddsaRdfc2022Cryptosuite })
]
