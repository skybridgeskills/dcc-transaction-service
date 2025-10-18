import { z } from 'zod'

/**
 * Zod schemas for VerifiableCredential based on @digitalcredentials/verifier-core type definitions
 * These schemas provide type-safe validation for VerifiableCredential and VerifiablePresentation
 * structures that are compatible with the verifier-core package.
 */

// ImageObject schema
export const imageObjectSchema = z.object({
  id: z.string(),
  type: z.string()
})

// IssuerObject schema
export const issuerObjectSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  name: z.string().optional(),
  url: z.string().optional(),
  image: z.union([z.string(), imageObjectSchema]).optional()
})

// Issuer schema (can be string or IssuerObject)
export const issuerSchema = z.union([z.string(), issuerObjectSchema])

// CreditValue schema
export const creditValueSchema = z.object({
  value: z.string().optional()
})

// CompletionDocument schema
export const completionDocumentSchema = z.object({
  type: z.string().optional(),
  identifier: z.string().optional(),
  name: z.string().optional(),
  description: z.string().optional(),
  numberOfCredits: creditValueSchema.optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

// EducationalOperationalCredentialExtensions schema
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

// EducationalOperationalCredential schema
export const educationalOperationalCredentialSchema =
  educationalOperationalCredentialExtensionsSchema.extend({
    id: z.string().optional(),
    name: z.string().optional(),
    description: z.string().optional(),
    competencyRequired: z.string().optional(),
    credentialCategory: z.string().optional(),
    achievementType: z.string().optional()
  })

// DegreeCompletion schema
export const degreeCompletionSchema = z.object({
  type: z.string(),
  name: z.string()
})

// StudentId schema
export const studentIdSchema = z.object({
  id: z.string(),
  image: z.string()
})

// OBV3IdentifierObject schema
export const obv3IdentifierObjectSchema = z.object({
  identityType: z.string().optional(),
  identityHash: z.string().optional()
})

// SubjectExtensions schema
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

// Subject schema
export const subjectSchema = subjectExtensionsSchema.extend({
  id: z.string().optional()
})

// Proof schema
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

// RenderMethod schema
export const renderMethodSchema = z.object({
  id: z.string().optional(),
  type: z.string(),
  name: z.string().optional(),
  css3MediaQuery: z.string().optional()
})

// CredentialStatus schema
export const credentialStatusSchema = z.object({
  id: z.string(),
  type: z.union([z.string(), z.array(z.string())]),
  statusPurpose: z.string(),
  statusListIndex: z.union([z.string(), z.number()]),
  statusListCredential: z.string()
})

// CredentialV1 schema
export const credentialV1Schema = z.object({
  '@context': z.array(z.string()),
  id: z.string().optional(),
  type: z.array(z.string()),
  issuer: issuerSchema,
  issuanceDate: z.string(),
  expirationDate: z.string().optional(),
  credentialSubject: subjectSchema,
  credentialStatus: z
    .union([credentialStatusSchema, z.array(credentialStatusSchema)])
    .optional(),
  proof: proofSchema.optional(),
  name: z.string().optional(),
  renderMethod: z.array(renderMethodSchema).optional()
})

// CredentialV2 schema
export const credentialV2Schema = z.object({
  '@context': z.array(z.string()),
  id: z.string().optional(),
  type: z.array(z.string()),
  issuer: issuerSchema,
  validFrom: z.string().optional(),
  validUntil: z.string().optional(),
  credentialSubject: subjectSchema,
  credentialStatus: z
    .union([credentialStatusSchema, z.array(credentialStatusSchema)])
    .optional(),
  proof: proofSchema.optional(),
  name: z.string().optional(),
  renderMethod: z.array(renderMethodSchema).optional()
})

// Credential schema (union of V1 and V2)
export const credentialSchema = z.union([
  credentialV1Schema,
  credentialV2Schema
])

// VerifiableCredential schema - can be single credential or array of credentials
// This matches the verifier-core type: Credential | Credential[]
export const verifiableCredentialSchema = z.union([
  credentialSchema,
  z.array(credentialSchema)
])

// VerifiablePresentation schema
export const verifiablePresentationSchema = z
  .object({
    '@context': z.array(z.string()),
    type: z.string(),
    issuer: issuerSchema,
    verifiableCredential: verifiableCredentialSchema,
    proof: proofSchema
  })
  .passthrough() // Allow additional properties

// Type exports for TypeScript inference
export type VerifiableCredential = z.infer<typeof verifiableCredentialSchema>
export type VerifiablePresentation = z.infer<
  typeof verifiablePresentationSchema
>
export type Credential = z.infer<typeof credentialSchema>
export type CredentialV1 = z.infer<typeof credentialV1Schema>
export type CredentialV2 = z.infer<typeof credentialV2Schema>
export type Issuer = z.infer<typeof issuerSchema>
export type Subject = z.infer<typeof subjectSchema>
export type Proof = z.infer<typeof proofSchema>
