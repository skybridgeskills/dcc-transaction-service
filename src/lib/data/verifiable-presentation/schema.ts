import { z } from 'zod'
import { JsonLdField } from '../jsonld-field.js'
import { proofSchema } from '../proof/schema.js'

const holderSchema = z.union([
  z.string(),
  z.object({ id: z.string() }).passthrough()
])

export const verifiablePresentationSchema = z
  .object({
    '@context': z.array(z.string()),
    id: z.string().optional(),
    type: JsonLdField(z.string()).refine(
      (arr) => arr.includes('VerifiablePresentation'),
      { message: "type must include 'VerifiablePresentation'" }
    ),
    /**
     * Optional per W3C VC Data Model — a Verifiable Presentation may carry
     * zero credentials (e.g. a DID-Authentication-only VP). Workflows that
     * require credentials enforce presence themselves.
     */
    verifiableCredential: JsonLdField(z.record(z.unknown())).optional(),
    holder: holderSchema.optional(),
    proof: proofSchema
  })
  .passthrough()

export type VerifiablePresentation = z.infer<
  typeof verifiablePresentationSchema
>
