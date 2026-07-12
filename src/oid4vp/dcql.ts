/**
 * Pure builder mapping a verify exchange's credential-type configuration
 * (`vprClaims`) onto a DCQL query (OID4VP 1.0 §6) embedded in the
 * authorization request.
 *
 * Mapping decisions (see `docs/oid4vp-1.0-verifier.md`):
 * - Exactly one credential query, `format: 'ldp_vc'`.
 * - `meta.type_values` is the CONSTANT `[[VC_TYPE_IRI]]` — the specific
 *   credential type is NOT put in the query (§B.1.1: `type_values` are
 *   fully-expanded IRIs). Type/claims enforcement stays post-verification.
 * - `claims` are derived 1:1 from `vprClaims`; the key is omitted entirely
 *   when `vprClaims` is empty (DCQL requires a non-empty `claims` array).
 */
import {
  VC_TYPE_IRI,
  dcqlQuerySchema,
  type DcqlClaim,
  type DcqlQuery
} from './schemas.js'

/** Map one verify-variable claim onto a DCQL claim, preserving `id`/`values` only when set. */
const toDcqlClaim = (claim: App.DcqlClaim): DcqlClaim => ({
  ...(claim.id ? { id: claim.id } : {}),
  path: claim.path as [string, ...string[]],
  ...(claim.values && claim.values.length > 0 ? { values: claim.values } : {})
})

/**
 * Build a spec-valid DCQL query from a verify exchange's `vprClaims`.
 * The returned object is validated through {@link dcqlQuerySchema} before
 * it is returned, so a malformed mapping fails fast at build time rather
 * than on the wire.
 */
export const buildDcqlQuery = ({
  vprClaims,
  queryId = 'credential'
}: {
  vprClaims: App.DcqlClaim[]
  queryId?: string
}): DcqlQuery => {
  const claims = vprClaims.map(toDcqlClaim)
  const query = {
    credentials: [
      {
        id: queryId,
        format: 'ldp_vc' as const,
        meta: { type_values: [[VC_TYPE_IRI]] },
        ...(claims.length > 0
          ? { claims: claims as [DcqlClaim, ...DcqlClaim[]] }
          : {})
      }
    ] as [DcqlQuery['credentials'][number]]
  }
  return dcqlQuerySchema.parse(query)
}
