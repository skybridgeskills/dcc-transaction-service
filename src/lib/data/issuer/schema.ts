import { z } from 'zod'

export const imageObjectSchema = z.object({
  id: z.string(),
  type: z.string()
})

export const issuerObjectSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional(),
  image: z.union([z.string(), imageObjectSchema]).optional()
})

/** VC issuer: a DID string or an issuer object with at least an `id`. */
export const issuerSchema = z.union([z.string(), issuerObjectSchema])

export type Issuer = z.infer<typeof issuerSchema>
