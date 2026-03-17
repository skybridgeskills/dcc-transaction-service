import { z } from 'zod'

export const proofSchema = z.object({
  type: z.string(),
  created: z.string(),
  verificationMethod: z.string(),
  proofPurpose: z.string(),
  proofValue: z.string(),
  cryptosuite: z.string().optional(),
  challenge: z.string().optional(),
  jws: z.string().optional()
})

export type Proof = z.infer<typeof proofSchema>
