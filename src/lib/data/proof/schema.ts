import { z } from 'zod'

export const proofSchema = z.object({
  type: z.string(),
  /**
   * OPTIONAL, and it must stay optional.
   *
   * Data Integrity makes `created` optional, and a selective-disclosure
   * DERIVED proof routinely omits it — the deriving wallet is not the
   * signer and has no creation time to assert. Requiring it here rejected
   * the presentation at the STRUCTURAL gate, before any cryptosuite was
   * ever consulted, so the failure surfaced as the wholly misleading
   * `Invalid Verifiable Credential(s)`.
   *
   * Shipping wallets send `ecdsa-sd-2023` derived proofs with no `created`,
   * and the rejection surfaced as
   * `at credential[0].proof.created: Required`. That is our instrument being
   * wrong about a spec we claim to speak — a wallet doing everything right was
   * recorded as failing.
   */
  created: z.string().optional(),
  verificationMethod: z.string(),
  proofPurpose: z.string(),
  proofValue: z.string(),
  cryptosuite: z.string().optional(),
  challenge: z.string().optional(),
  jws: z.string().optional()
})

export type Proof = z.infer<typeof proofSchema>

/**
 * One proof, or a SET of them.
 *
 * The VC Data Model types `proof` as a proof or a set of proofs, and
 * multi-proof credentials are ordinary: one third-party issuer emits three
 * (`ecdsa-rdfc-2019`, `ecdsa-jcs-2019`, `ecdsa-sd-2023`) on a single
 * credential, and such a presentation completes end-to-end.
 *
 * Taking only the object rejected such a credential at the STRUCTURAL gate,
 * before any cryptosuite was consulted, so the failure surfaced as the wholly
 * misleading `Invalid Verifiable Credential(s)`.
 *
 * The error a shipping wallet's multi-proof presentation drew was
 * `at credential[0].proof: Expected object, received array`. That is our
 * instrument being wrong about a spec we claim to speak, and the THIRD field
 * to fail that way after `created` above and the VPR's `acceptedMethods` wire
 * format.
 *
 * The union validates elementwise — a set is not an escape hatch, and junk
 * inside one is still rejected. `proof` stays `.optional()` at the call sites,
 * so an EMPTY set is deliberately not special-cased here: a credential with no
 * usable proof should fail at the verification gate with a real message rather
 * than at this one with a structural error. That distinction is the whole
 * lesson of this defect class.
 */
export const proofSetSchema = z.union([proofSchema, z.array(proofSchema)])

export type ProofSet = z.infer<typeof proofSetSchema>
