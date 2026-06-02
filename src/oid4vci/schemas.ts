/**
 * Zod schemas for every OID4VCI 1.0 wire payload this service emits or
 * accepts. Used as the single source of truth for parsing inbound
 * requests and constructing outbound responses.
 *
 * Spec: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html
 */
import { z } from 'zod'

// --- Credential Offer (§4.1) -----------------------------------------------

export const PRE_AUTHORIZED_GRANT =
  'urn:ietf:params:oauth:grant-type:pre-authorized_code'
export type PreAuthorizedGrant = typeof PRE_AUTHORIZED_GRANT

export const preAuthorizedGrantParamsSchema = z.object({
  'pre-authorized_code': z.string().min(1)
  // tx_code, authorization_server are deferred to a follow-up plan.
})

export const credentialOfferSchema = z.object({
  credential_issuer: z.string().url(),
  credential_configuration_ids: z.array(z.string().min(1)).nonempty(),
  grants: z.object({
    [PRE_AUTHORIZED_GRANT]: preAuthorizedGrantParamsSchema
  })
})
export type CredentialOffer = z.infer<typeof credentialOfferSchema>

// --- Token Request / Response (§6) ----------------------------------------

export const tokenRequestSchema = z.object({
  grant_type: z.string().min(1),
  'pre-authorized_code': z.string().optional()
  // tx_code, client_id, scope, authorization_details deferred.
})
export type TokenRequest = z.infer<typeof tokenRequestSchema>

export const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal('Bearer'),
  expires_in: z.number().int().positive()
})
export type TokenResponse = z.infer<typeof tokenResponseSchema>

/**
 * RFC 6749 §5.2 + OID4VCI 1.0 §6.3 token error codes we surface.
 */
export const tokenErrorCodeSchema = z.enum([
  'invalid_request',
  'invalid_grant',
  'unsupported_grant_type',
  'invalid_client'
])
export type TokenErrorCode = z.infer<typeof tokenErrorCodeSchema>

export const tokenErrorResponseSchema = z.object({
  error: tokenErrorCodeSchema,
  error_description: z.string().optional()
})
export type TokenErrorResponse = z.infer<typeof tokenErrorResponseSchema>

// --- Nonce Response (§7.2) -------------------------------------------------

export const nonceResponseSchema = z.object({
  c_nonce: z.string().min(1)
})
export type NonceResponse = z.infer<typeof nonceResponseSchema>

// --- Credential Request / Response (§8) -----------------------------------

/**
 * `proofs` per OID4VCI 1.0 §8.2. We accept a single proof type at a
 * time in this plan: `di_vp` (Data Integrity Verifiable Presentation).
 * Other types (`jwt`, `ldp_vp`, `cwt`) are deferred.
 */
export const proofsSchema = z.object({
  di_vp: z.array(z.record(z.unknown())).nonempty()
})
export type Proofs = z.infer<typeof proofsSchema>

export const credentialRequestSchema = z.object({
  credential_configuration_id: z.string().min(1),
  proofs: proofsSchema
  // credential_identifier (token-issued), credential_response_encryption deferred.
})
export type CredentialRequest = z.infer<typeof credentialRequestSchema>

export const credentialResponseEntrySchema = z.object({
  credential: z.unknown()
})

export const credentialResponseSchema = z.object({
  credentials: z.array(credentialResponseEntrySchema).nonempty()
  // transaction_id, interval, notification_id deferred.
})
export type CredentialResponse = z.infer<typeof credentialResponseSchema>

/**
 * OID4VCI 1.0 §8.3.1.2 credential error codes.
 */
export const credentialErrorCodeSchema = z.enum([
  'invalid_credential_request',
  'unknown_credential_configuration',
  'unknown_credential_identifier',
  'invalid_proof',
  'invalid_nonce',
  'invalid_encryption_parameters',
  'credential_request_denied'
])
export type CredentialErrorCode = z.infer<typeof credentialErrorCodeSchema>

export const credentialErrorResponseSchema = z.object({
  error: credentialErrorCodeSchema,
  error_description: z.string().optional()
})
export type CredentialErrorResponse = z.infer<typeof credentialErrorResponseSchema>

// --- Issuer Metadata (§12.2) -----------------------------------------------

/**
 * Single entry of `credential_configurations_supported`. We support the
 * `ldp_vc` format only in this plan; the schema is intentionally loose
 * in places (e.g. `credential_definition`) so future format profiles
 * can extend without churning the type.
 */
export const credentialConfigurationSupportedSchema = z.object({
  format: z.literal('ldp_vc'),
  credential_definition: z.object({
    '@context': z.array(z.string()).nonempty(),
    type: z.array(z.string()).nonempty()
  }),
  cryptographic_binding_methods_supported: z.array(z.string()).optional(),
  credential_signing_alg_values_supported: z.array(z.string()).optional(),
  proof_types_supported: z
    .object({
      di_vp: z
        .object({
          proof_signing_alg_values_supported: z.array(z.string()).nonempty()
        })
        .optional()
    })
    .optional()
})
export type CredentialConfigurationSupported = z.infer<
  typeof credentialConfigurationSupportedSchema
>

export const issuerMetadataSchema = z.object({
  credential_issuer: z.string().url(),
  authorization_servers: z.array(z.string().url()).nonempty(),
  credential_endpoint: z.string().url(),
  nonce_endpoint: z.string().url(),
  credential_configurations_supported: z.record(
    z.string(),
    credentialConfigurationSupportedSchema
  )
})
export type IssuerMetadata = z.infer<typeof issuerMetadataSchema>

// --- OAuth AS Metadata for OID4VCI (§3.5 + RFC 8414) ----------------------

export const oid4vciAsMetadataSchema = z.object({
  issuer: z.string().url(),
  token_endpoint: z.string().url(),
  grant_types_supported: z.array(z.string()).nonempty(),
  response_types_supported: z.array(z.string()),
  token_endpoint_auth_methods_supported: z.array(z.string()).nonempty(),
  /**
   * OID4VCI extension flag: when true, wallets MAY omit `client_id`
   * from token requests using the pre-authorized code grant
   * (anonymous access). See OID4VCI 1.0 §3.5.
   */
  'pre-authorized_grant_anonymous_access_supported': z.boolean()
})
export type Oid4vciAsMetadata = z.infer<typeof oid4vciAsMetadataSchema>
