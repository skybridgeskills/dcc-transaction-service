import { z } from 'zod'
import { JsonLdField, JsonLdFieldAllowEmpty } from '../jsonld-field.js'
import { issuerSchema } from '../issuer/schema.js'
import { proofSchema } from '../proof/schema.js'
import {
  zodProblemDetails,
  PARSING_ERROR,
  type ProblemDetail
} from '../../errors/problem-details.js'

export { issuerSchema } from '../issuer/schema.js'
export { proofSchema } from '../proof/schema.js'

/** VCDM 1.1 context URL (https://www.w3.org/2018/credentials/v1) */
export const CREDENTIAL_CONTEXT_V1 = 'https://www.w3.org/2018/credentials/v1'
/** VCDM 2.0 context URL (https://www.w3.org/ns/credentials/v2) */
export const CREDENTIAL_CONTEXT_V2 = 'https://www.w3.org/ns/credentials/v2'

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

export type CredentialV1 = z.infer<typeof credentialV1Schema>
export type CredentialV2 = z.infer<typeof credentialV2Schema>
export type Credential = CredentialV1 | CredentialV2

/**
 * Parses a credential by detecting VC Data Model version from @context,
 * then validating with the appropriate schema. Produces clear errors
 * for invalid @context or unsupported versions.
 */
export function parseCredential(
  vc: unknown,
  prefix?: string
):
  | { success: true; data: Credential }
  | { success: false; problemDetails: ProblemDetail[] } {
  const versionResult = detectCredentialVersion(vc)
  if (!versionResult.ok) {
    const location = prefix ? `${prefix}: ` : ''
    const detail = `${location}${versionResult.message}`
    return {
      success: false,
      problemDetails: [
        {
          type: `https://www.w3.org/TR/vc-data-model#${PARSING_ERROR}`,
          status: 400,
          title: PARSING_ERROR,
          detail
        }
      ]
    }
  }

  const schema =
    versionResult.version === 'v2' ? credentialV2Schema : credentialV1Schema
  const result = schema.safeParse(vc)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    problemDetails: zodProblemDetails(result.error.issues, prefix)
  }
}

export type Subject = z.infer<typeof subjectSchema>

function detectCredentialVersion(
  vc: unknown
): { ok: true; version: 'v1' | 'v2' } | { ok: false; message: string } {
  if (vc === null || typeof vc !== 'object') {
    return { ok: false, message: 'Credential must be an object' }
  }
  const ctx = (vc as Record<string, unknown>)['@context']
  if (!Array.isArray(ctx)) {
    return {
      ok: false,
      message:
        typeof ctx === 'string'
          ? '@context must be an array'
          : '@context is required and must be an array'
    }
  }
  const contextStrings = ctx.filter((x): x is string => typeof x === 'string')
  const hasV2 = contextStrings.includes(CREDENTIAL_CONTEXT_V2)
  const hasV1 = contextStrings.includes(CREDENTIAL_CONTEXT_V1)
  if (hasV2) return { ok: true, version: 'v2' }
  if (hasV1) return { ok: true, version: 'v1' }
  return { ok: false, message: 'Unsupported VC Data Model version' }
}
