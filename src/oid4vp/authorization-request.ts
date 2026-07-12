/**
 * Pure builders for the OID4VP 1.0 authorization request and the
 * per-exchange URLs it references.
 *
 * These functions are I/O-free; the route handler owns persistence
 * (`ensureOid4vpState` + `saveExchange`) and serving.
 *
 * Spec anchors: §5 (authorization request params), §5.1 / §B.1.3.2.3
 * (`client_metadata.vp_formats_supported`), §5.9.3 (`redirect_uri`
 * client_id prefix — unsigned, all metadata inline).
 */
import { buildDcqlQuery } from './dcql.js'
import {
  OID4VP_CRYPTOSUITE_VALUES,
  authorizationRequestSchema,
  type AuthorizationRequest
} from './schemas.js'

/** Data Integrity proof type advertised for every supported format. */
const DATA_INTEGRITY_PROOF_TYPE = 'DataIntegrityProof'

/**
 * Per-exchange base URL, mirroring the OID4VCI
 * `credentialIssuerUrlForExchange` shape. All OID4VP endpoints hang off
 * `${base}/openid4vp/*`.
 */
export const verifierUrlForExchange = (
  exchange: App.ExchangeDetailVerify
): string =>
  `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

/** URL the wallet POSTs the `direct_post` response to. */
export const responseUriForExchange = (
  exchange: App.ExchangeDetailVerify
): string => `${verifierUrlForExchange(exchange)}/openid4vp/response`

/** URL the wallet GETs to fetch the authorization request JSON (by reference). */
export const requestUriForExchange = (
  exchange: App.ExchangeDetailVerify
): string => `${verifierUrlForExchange(exchange)}/openid4vp/request`

/**
 * `client_id` under the `redirect_uri` prefix (§5.9.3): the verifier is
 * identified by the very URL the response is posted to. Such requests
 * MUST NOT be signed and carry all verifier metadata inline via
 * `client_metadata`.
 */
export const clientIdForExchange = (
  exchange: App.ExchangeDetailVerify
): string => `redirect_uri:${responseUriForExchange(exchange)}`

/**
 * Build the unsigned OID4VP 1.0 authorization request for a verify
 * exchange. `ensureOid4vpState` MUST have run (and been persisted) first
 * so `variables.oid4vp.state` is present.
 *
 * The returned object is validated through {@link authorizationRequestSchema}
 * before it is returned.
 */
export const buildAuthorizationRequest = (
  exchange: App.ExchangeDetailVerify
): AuthorizationRequest => {
  const vpFormat = {
    proof_type_values: [DATA_INTEGRITY_PROOF_TYPE],
    cryptosuite_values: OID4VP_CRYPTOSUITE_VALUES
  }
  const request = {
    response_type: 'vp_token' as const,
    response_mode: 'direct_post' as const,
    client_id: clientIdForExchange(exchange),
    // `response_uri` MAY be omitted under the redirect_uri prefix; we
    // include it for robustness (it equals the client_id target URL).
    response_uri: responseUriForExchange(exchange),
    nonce: exchange.variables.challenge,
    ...(exchange.variables.oid4vp?.state
      ? { state: exchange.variables.oid4vp.state }
      : {}),
    dcql_query: buildDcqlQuery({ vprClaims: exchange.variables.vprClaims }),
    client_metadata: {
      vp_formats_supported: {
        ldp_vc: vpFormat,
        ldp_vp: vpFormat
      }
    }
  }
  return authorizationRequestSchema.parse(request)
}
