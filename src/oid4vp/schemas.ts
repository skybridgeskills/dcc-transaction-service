/**
 * Zod schemas for every OID4VP 1.0 wire payload this verifier emits or
 * accepts. Used as the single source of truth for parsing inbound
 * `direct_post` responses and constructing the outbound authorization
 * request.
 *
 * This binding covers TWO query mechanisms — DCQL and DIF Presentation
 * Exchange (`presentation_definition`), selected per exchange — together
 * with the unsigned `redirect_uri` client_id prefix and the `direct_post`
 * response mode. Signed request objects, `direct_post.jwt` and
 * `presentation_definition_uri` remain out of scope
 * (see `docs/oid4vp-1.0-verifier.md` and the binding ADR).
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
  vp_formats_supported: vpFormatsSupportedSchema,
  /**
   * JAR's own opt-out knob (RFC 9101 §10.x security considerations, carried
   * into OAuth client metadata).
   *
   * ⚠️ Three-valued at the profile, two-valued here, and **omission is a third
   * claim rather than a default**: a verifier that states a value knows the rule
   * and has taken a position in the vocabulary the rule provides, where one that
   * omits the key has said nothing at all. Only the signed arm states it
   * (`true`); the `declared-false` spelling stands on the profile surface
   * because stating `false` is an honest opt-out and omitting is not the same
   * bytes. ⚠️ No registered profile states `false` — the field is not
   * vestigial, it is unclaimed.
   */
  require_signed_request_object: z.boolean().optional()
})
export type ClientMetadata = z.infer<typeof clientMetadataSchema>

// --- Authorization request (§5) --------------------------------------------

/**
 * The unsigned OID4VP 1.0 authorization request this verifier serves at
 * `GET .../openid4vp/request`. `client_id` uses the `redirect_uri:`
 * prefix (§5.9.3); `nonce` reuses the exchange `challenge`; `state`
 * correlates the eventual `direct_post` back to this request.
 */
// --- Presentation Exchange (DIF PE v2.0.0) ---------------------------------

/**
 * A single PEX constraint field. `path` is a non-empty array of JSONPaths
 * (we emit exactly one); `filter` is a JSON Schema fragment. Kept loose on
 * the filter shape deliberately — PEX permits arbitrary JSON Schema and we
 * only ever emit two forms (`enum` over strings, `contains.const` over an
 * array).
 */
export const pexFieldSchema = z.object({
  id: z.string().optional(),
  path: z.array(z.string().min(1)).nonempty(),
  filter: z.record(z.string(), z.unknown()).optional()
})
export type PexField = z.infer<typeof pexFieldSchema>

/** Format constraint block: proof types acceptable for a Data Integrity credential. */
export const pexFormatSchema = z.object({
  ldp_vc: z.object({ proof_type: z.array(z.string()).nonempty() }).optional(),
  ldp_vp: z.object({ proof_type: z.array(z.string()).nonempty() }).optional()
})

export const pexInputDescriptorSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  purpose: z.string().optional(),
  constraints: z.object({
    fields: z.array(pexFieldSchema),
    /**
     * DIF PE `limit_disclosure`. `fields` alone is only a MATCHING
     * constraint — a conformant wallet may satisfy it with the WHOLE
     * credential. `limit_disclosure: 'required'` is the instruction that
     * means "return ONLY the matched fields". Optional so every existing
     * definition (which omits it) still validates and is emitted byte-identically.
     */
    limit_disclosure: z.enum(['required', 'preferred']).optional()
  }),
  format: pexFormatSchema.optional()
})

/**
 * `presentation_definition` as embedded by value in the authorization
 * request. `presentation_definition_uri` (by reference) is not emitted.
 */
export const presentationDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  purpose: z.string().optional(),
  input_descriptors: z.array(pexInputDescriptorSchema).nonempty(),
  format: pexFormatSchema.optional()
})
export type PresentationDefinition = z.infer<
  typeof presentationDefinitionSchema
>

/**
 * The authorization request carries **at least one** query language.
 *
 * ⚠️ **This used to require exactly one, and the reason it no longer does is
 * worth reading before tightening it back.** The original argument — a request
 * with both leaves the wallet to choose and makes the response ambiguous —
 * still holds, and it is why the single-language arms remain single-language.
 * But a shipping verifier sends both in one object and a wallet we must
 * interoperate with resolves it, where that same wallet does not resolve our
 * single-language JSON. The ambiguity is accepted on **that arm only**, as a
 * registered accommodation, because an ambiguous response we can read beats no
 * response at all.
 *
 * ⚠️ Which arm may carry both is decided by the active protocol profile, not
 * here. A request with **neither** still asks for nothing and is still refused.
 *
 * ⚠️ **This object is not `.strict()`, so an unnamed field is STRIPPED, not
 * rejected.** Every parameter the service emits has to be declared below or it
 * silently never reaches the wire — which is why the accommodation's extra
 * parameters are named here rather than merged in after the parse.
 */
export const authorizationRequestSchema = z
  .object({
    response_type: z.literal('vp_token'),
    response_mode: z.literal('direct_post'),
    client_id: z.string().min(1),
    /**
     * The draft-era spelling of the Client Identifier Prefix, which 1.0-final
     * removed. Emitted alongside the prefixed `client_id` only when an
     * exchange opts into the draft-compatibility accommodation, so one
     * request reaches both a draft wallet and a 1.0 wallet — at the cost of
     * being strictly conformant to neither.
     */
    client_id_scheme: z.string().min(1).optional(),
    response_uri: z.string().url().optional(),
    /** Where the wallet may POST to fetch the request object. Emitted only on request. */
    request_uri_method: z.enum(['get', 'post']).optional(),
    /** Origins this verifier expects to be reached on. Emitted only on request. */
    expected_origins: z.array(z.string().url()).nonempty().optional(),
    nonce: z.string().min(1),
    state: z.string().min(1).optional(),
    dcql_query: dcqlQuerySchema.optional(),
    presentation_definition: presentationDefinitionSchema.optional(),
    client_metadata: clientMetadataSchema
  })
  .refine(
    (r) => r.dcql_query !== undefined || r.presentation_definition !== undefined,
    {
      message:
        'At least one of `dcql_query` or `presentation_definition` must be present; a request carrying neither asks for nothing.'
    }
  )
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

/**
 * A PEX `descriptor_map` entry. `path` locates the presentation inside the
 * `vp_token`; `path_nested` walks from there to the credential.
 */
export const pexDescriptorMapEntrySchema: z.ZodType<{
  id: string
  format: string
  path: string
  path_nested?: { id?: string; format: string; path: string }
}> = z.object({
  id: z.string(),
  format: z.string(),
  path: z.string().min(1),
  path_nested: z
    .object({
      id: z.string().optional(),
      format: z.string(),
      path: z.string().min(1)
    })
    .optional()
})

export const presentationSubmissionSchema = z.object({
  id: z.string(),
  definition_id: z.string(),
  descriptor_map: z.array(pexDescriptorMapEntrySchema).nonempty()
})
export type PresentationSubmission = z.infer<
  typeof presentationSubmissionSchema
>

/**
 * The inbound wallet `direct_post` body for a **PEX** exchange. Unlike the
 * DCQL arm, `vp_token` is the presentation itself (or an array of them),
 * NOT an object keyed by query id, and it is accompanied by a
 * `presentation_submission`.
 *
 * As with the DCQL arm, presentation values stay `z.unknown()` on purpose:
 * the raw signed VP must reach verifier-core byte-for-byte, and
 * Zod-parsing it would break canonicalization.
 */
export const directPostPexResponseSchema = z.object({
  vp_token: z.union([z.unknown(), z.array(z.unknown()).nonempty()]),
  presentation_submission: presentationSubmissionSchema,
  state: z.string().optional()
})
export type DirectPostPexResponse = z.infer<typeof directPostPexResponseSchema>

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

/**
 * An error response sent by the **wallet** to the response endpoint, in place
 * of a presentation, when it cannot or will not satisfy the request (§5.10 —
 * the error is returned "in the same manner" as the authorization response,
 * which for `direct_post` means POSTed to the `response_uri`).
 *
 * This is a different, conformant message — not a malformed presentation
 * response — and it is recognised by its own required member rather than by
 * sniffing a payload's shape. The rule in `response-handler.ts` still holds
 * for everything else: a response in the wrong shape is a failure, not a shape
 * to rescue. Which is why `vp_token` must be **absent**: a body carrying both
 * is neither message, and must not be rescued into either.
 *
 * `error` is a free string, deliberately, where the outbound
 * {@link oid4vpErrorCodeSchema} is an enum. The codes a wallet may send are
 * OAuth 2.0's plus OID4VP's plus whatever its own profile adds, and the entire
 * value of this message is the wallet's own diagnosis. Narrowing it to a list
 * we happen to know would reject exactly the report we did not anticipate,
 * which is the one worth having.
 */
export const walletErrorResponseSchema = z.object({
  error: z.string().min(1),
  error_description: z.string().optional(),
  error_uri: z.string().optional(),
  state: z.string().optional(),
  vp_token: z.undefined()
})
export type WalletErrorResponse = z.infer<typeof walletErrorResponseSchema>
