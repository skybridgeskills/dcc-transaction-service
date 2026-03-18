import { z } from 'zod'
import { JsonLdField, JsonLdFieldAllowEmpty } from '../jsonld-field.js'
import { issuerSchema } from '../issuer/schema.js'
import { proofSchema } from '../proof/schema.js'

export { issuerSchema } from '../issuer/schema.js'
export { proofSchema } from '../proof/schema.js'

/** Extendable record; credentialSubject may have optional id and any other properties. */
export const subjectSchema = z
  .object({ id: z.string().optional() })
  .passthrough()

export const renderMethodSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  name: z.string().optional(),
  css3MediaQuery: z.string().optional()
})

export const credentialStatusSchema = z.object({
  id: z.string(),
  type: z.union([z.string(), z.array(z.string())]),
  statusPurpose: z.string(),
  statusListIndex: z.union([z.string(), z.number()]),
  statusListCredential: z.string()
})

const vcType = JsonLdField(z.string()).refine(
  (arr) => arr.includes('VerifiableCredential'),
  { message: "type must include 'VerifiableCredential'" }
)

const vcCredentialStatus = JsonLdFieldAllowEmpty(
  credentialStatusSchema
).optional()

export const credentialV1Schema = z
  .object({
    '@context': z.array(z.string()),
    id: z.string().optional(),
    type: vcType,
    issuer: issuerSchema,
    issuanceDate: z.string().optional(),
    expirationDate: z.string().optional(),
    credentialSubject: subjectSchema,
    credentialStatus: vcCredentialStatus.optional(),
    proof: proofSchema.optional(),
    name: z.string().optional(),
    renderMethod: z.array(renderMethodSchema).optional()
  })
  .passthrough()

export const credentialV2Schema = z
  .object({
    '@context': z.array(z.string()),
    id: z.string().optional(),
    type: vcType,
    issuer: issuerSchema,
    validFrom: z.string().optional(),
    validUntil: z.string().optional(),
    credentialSubject: subjectSchema,
    credentialStatus: vcCredentialStatus,
    proof: proofSchema.optional(),
    name: z.string().optional(),
    renderMethod: z.array(renderMethodSchema).optional()
  })
  .passthrough()

export const credentialSchema = z.union([
  credentialV1Schema,
  credentialV2Schema
])

export type Credential = z.infer<typeof credentialSchema>
export type CredentialV1 = z.infer<typeof credentialV1Schema>
export type CredentialV2 = z.infer<typeof credentialV2Schema>
export type Subject = z.infer<typeof subjectSchema>
