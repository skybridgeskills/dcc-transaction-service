/** Cryptosuites this service can verify on incoming presentations (VPR sender capability). */
export const VERIFIABLE_CRYPTOSUITES = [
  { cryptosuite: 'eddsa-rdfc-2022' },
  { cryptosuite: 'ecdsa-rdfc-2019' },
  { cryptosuite: 'ed25519-signature-2020' }
] as const
