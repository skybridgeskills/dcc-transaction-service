import { z } from 'zod'
import { JsonLdField, JsonLdFieldAllowEmpty } from '../jsonld-field.js'
import { issuerSchema } from '../issuer/schema.js'
import { proofSchema } from '../proof/schema.js'

export { issuerSchema } from '../issuer/schema.js'
export { proofSchema } from '../proof/schema.js'

export const imageObjectSchema = z.object({
  id: z.string(),
  type: z.string()
})

export const creditValueSchema = z.object({
  value: z.string().optional()
})

export const completionDocumentSchema = z.object({
  type: z.string().optional(),
  identifier: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  numberOfCredits: creditValueSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

export const educationalOperationalCredentialExtensionsSchema = z.object({
  type: z.array(z.string()).optional(),
  awardedOnCompletionOf: completionDocumentSchema.optional(),
  criteria: z
    .object({
      type: z.string(),
      narrative: z.string()
    })
    .optional(),
  image: imageObjectSchema.optional()
})

export const educationalOperationalCredentialSchema =
  educationalOperationalCredentialExtensionsSchema.extend({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    competencyRequired: z.string().optional(),
    credentialCategory: z.string().optional(),
    achievementType: z.string().optional()
  })

export const degreeCompletionSchema = z.object({
  type: z.string(),
  name: z.string()
})

export const studentIdSchema = z.object({
  id: z.string(),
  image: z.string()
})

export const obv3IdentifierObjectSchema = z.object({
  identityType: z.string().optional(),
  identityHash: z.string().optional()
})

export const subjectExtensionsSchema = z.object({
  type: z.string().optional(),
  name: z.string().optional(),
  hasCredential: educationalOperationalCredentialSchema.optional(),
  degree: degreeCompletionSchema.optional(),
  studentId: studentIdSchema.optional(),
  achievement: z
    .union([
      educationalOperationalCredentialSchema,
      z.array(educationalOperationalCredentialSchema)
    ])
    .optional(),
  identifier: z
    .union([obv3IdentifierObjectSchema, z.array(obv3IdentifierObjectSchema)])
    .optional()
})

export const subjectSchema = subjectExtensionsSchema.extend({
  id: z.string().optional()
})

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
    issuanceDate: z.string(),
    expirationDate: z.string().optional(),
    credentialSubject: subjectSchema,
    credentialStatus: vcCredentialStatus,
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
