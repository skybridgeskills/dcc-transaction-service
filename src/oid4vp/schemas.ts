/**
 * Zod schemas for every OID4VP 1.0 wire payload this verifier emits or
 * accepts. Used as the single source of truth for parsing inbound
 * `direct_post` responses and constructing the outbound authorization
 * request.
 *
 * This binding covers the DCQL query mechanism, the unsigned
 * `redirect_uri` client_id prefix, and the `direct_post` response mode
 * only. `presentation_definition` (PEX), signed request objects, and
 * `direct_post.jwt` are out of scope (see `docs/oid4vp-1.0-verifier.md`).
 *
 * Spec: https://openid.net/specs/openid-4-verifiable-presentations-1_0.html
 */
import { z } from 'zod'
import { VERIFIABLE_CRYPTOSUITES } from '../lib/verifiable-cryptosuites.js'

/**
 * The single fully-expanded VCDM type IRI used in DCQL `meta.type_values`
 * for W3C Data Integrity credentials. Per OID4VP 1.0 §B.1.1 the
 * `type_values` are the type IRIs after `@context` expansion, so the
 * specific credential type (e.g. `OpenBadgeCredential`) is NOT expressed
 * here — it stays a post-verification constraint. Every VCDM credential
 * carries this base type, so the query is a constant.
 */
export const VC_TYPE_IRI =
  'https://www.w3.org/2018/credentials#VerifiableCredential'

/**
 * Data Integrity cryptosuites this verifier advertises in OID4VP
 * `client_metadata.vp_formats_supported`. Derived from the service-wide
 * {@link VERIFIABLE_CRYPTOSUITES} capability list, filtered to the
 * `-rdfc-` Data Integrity suites the OID4-ECDSA profile expects.
 *
 * `ed25519-signature-2020` is a legacy proof type (not a
 * `DataIntegrityProof`/`cryptosuite` value in the OID4VP sense) and is
 * intentionally not advertised here, even though the verify pipeline can
 * still verify it on inbound presentations.
 */
export const OID4VP_CRYPTOSUITE_VALUES: string[] = VERIFIABLE_CRYPTOSUITES.map(
  (c) => c.cryptosuite
).filter((c) => c.includes('-rdfc-'))

// --- DCQL query (§6) --------------------------------------------------------

/**
 * A single DCQL claims query. Maps 1:1 onto {@link App.DcqlClaim}: a
 * JSON pointer-ish `path` (array of segments) and optional expected
 * `values`. `id` is optional and preserved when present.
 */
export const dcqlClaimSchema = z.object({
  id: z.string().min(1).optional(),
  path: z.array(z.string()).nonempty(),
  values: z.array(z.union([z.string(), z.number(), z.boolean()])).optional()
})
export type DcqlClaim = z.infer<typeof dcqlClaimSchema>

/**
 * A single DCQL credential query. This binding emits exactly one, with
 * `format: 'ldp_vc'` and the constant {@link VC_TYPE_IRI} in
 * `meta.type_values` (§B.1.1). `claims` is omitted entirely when empty
 * (DCQL requires a non-empty array when present).
 */
export const dcqlCredentialQuerySchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  format: z.literal('ldp_vc'),
  meta: z.object({
    type_values: z.array(z.array(z.string()).nonempty()).nonempty()
  }),
  claims: z.array(dcqlClaimSchema).nonempty().optional()
})
export type DcqlCredentialQuery = z.infer<typeof dcqlCredentialQuerySchema>

/** Top-level DCQL query object (`dcql_query`). */
export const dcqlQuerySchema = z.object({
  credentials: z.array(dcqlCredentialQuerySchema).nonempty()
})
export type DcqlQuery = z.infer<typeof dcqlQuerySchema>

// --- client_metadata (§5.1, §B.1.3.2.3) ------------------------------------

/**
 * `vp_formats_supported` entry: the Data Integrity proof type(s) and
 * cryptosuite(s) this verifier accepts for a given credential/
 * presentation format.
 */
export const vpFormatSchema = z.object({
  proof_type_values: z.array(z.string()).optional(),
  cryptosuite_values: z.array(z.string()).optional()
})
export type VpFormat = z.infer<typeof vpFormatSchema>

export const vpFormatsSupportedSchema = z.record(z.string(), vpFormatSchema)
export type VpFormatsSupported = z.infer<typeof vpFormatsSupportedSchema>

export const clientMetadataSchema = z.object({
  vp_formats_supported: vpFormatsSupportedSchema
})
export type ClientMetadata = z.infer<typeof clientMetadataSchema>

// --- Authorization request (§5) --------------------------------------------

/**
 * The unsigned OID4VP 1.0 authorization request this verifier serves at
 * `GET .../openid4vp/request`. `client_id` uses the `redirect_uri:`
 * prefix (§5.9.3); `nonce` reuses the exchange `challenge`; `state`
 * correlates the eventual `direct_post` back to this request.
 */
export const authorizationRequestSchema = z.object({
  response_type: z.literal('vp_token'),
  response_mode: z.literal('direct_post'),
  client_id: z.string().min(1),
  response_uri: z.string().url().optional(),
  nonce: z.string().min(1),
  state: z.string().min(1).optional(),
  dcql_query: dcqlQuerySchema,
  client_metadata: clientMetadataSchema
})
export type AuthorizationRequest = z.infer<typeof authorizationRequestSchema>

// --- direct_post response (§8.2, §14) --------------------------------------

/**
 * The inbound wallet `direct_post` body. With DCQL, `vp_token` is a JSON
 * object keyed by each credential-query `id`, each value a non-empty
 * array of presentations; there is NO `presentation_submission`.
 *
 * The presentation values are kept `z.unknown()` on purpose: the raw
 * signed VP must reach verifier-core byte-for-byte (see
 * `preparePresentationForVerify` — Zod-parsing the VP would break
 * canonicalization).
 */
export const directPostResponseSchema = z.object({
  vp_token: z.record(z.string(), z.array(z.unknown()).nonempty()),
  state: z.string().optional()
})
export type DirectPostResponse = z.infer<typeof directPostResponseSchema>

// --- Error responses (§5.10 / OAuth 2.0) -----------------------------------

/**
 * OID4VP 1.0 authorization-error codes this verifier surfaces on the
 * `direct_post` / `request_uri` endpoints.
 */
export const oid4vpErrorCodeSchema = z.enum([
  'invalid_request',
  'invalid_client',
  'vp_formats_not_supported',
  'invalid_presentation'
])
export type Oid4vpErrorCode = z.infer<typeof oid4vpErrorCodeSchema>

export const oid4vpErrorResponseSchema = z.object({
  error: oid4vpErrorCodeSchema,
  error_description: z.string().optional()
})
export type Oid4vpErrorResponse = z.infer<typeof oid4vpErrorResponseSchema>
