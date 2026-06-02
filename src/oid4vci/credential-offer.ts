/**
 * Pure builders for the OID4VCI Credential Offer object and the
 * `openid-credential-offer://` deep link a wallet scans/clicks.
 *
 * These functions are I/O-free; the route handler is responsible for
 * persisting any new pre-authorized code via `saveExchange`.
 */
import { PRE_AUTHORIZED_GRANT, type CredentialOffer } from './schemas.js'

/**
 * Stable, lowercase-friendly id used as a key in
 * `credential_configurations_supported` and an entry in the offer's
 * `credential_configuration_ids`. Derived from the VC template's
 * non-base type (e.g. `OpenBadgeCredential`) so an integration test
 * can pin against a known value.
 */
export const deriveCredentialConfigurationId = (vcTemplate: string): string => {
  const fallback = 'VerifiableCredential'
  let parsed: unknown
  try {
    parsed = JSON.parse(vcTemplate)
  } catch {
    return fallback
  }
  const type = (parsed as { type?: unknown }).type
  const types = Array.isArray(type) ? type : type ? [type] : []
  const nonBase = types.find(
    (t) => typeof t === 'string' && t !== 'VerifiableCredential'
  )
  return typeof nonBase === 'string' ? nonBase : fallback
}

/**
 * Per-exchange credential issuer URL the wallet uses as the base for
 * `${credential_issuer}/.well-known/openid-credential-issuer/...`.
 *
 * Per OID4VCI 1.0 §12.2.1 the URL identifies the issuer. We use the
 * exchange host + the existing per-exchange path so the wallet's
 * follow-up requests stay scoped to a single exchange's lifetime.
 */
export const credentialIssuerUrlForExchange = (
  exchange: App.ExchangeDetailClaim
): string =>
  `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

/**
 * URL the wallet hits to fetch the Credential Offer JSON (the value
 * referenced by `credential_offer_uri` in the deep link).
 */
export const credentialOfferUriForExchange = (
  exchange: App.ExchangeDetailClaim
): string => `${credentialIssuerUrlForExchange(exchange)}/openid/credential-offer`

/**
 * Build the OID4VCI 1.0 §4.1 Credential Offer object for a claim
 * exchange. Requires `variables.oid4vci.preAuthorizedCode` to be set
 * — the route handler ensures this via `ensurePreAuthorizedCode`
 * before calling.
 */
export const buildCredentialOffer = (
  exchange: App.ExchangeDetailClaim
): CredentialOffer => {
  const code = exchange.variables.oid4vci?.preAuthorizedCode
  if (!code) {
    throw new Error(
      'buildCredentialOffer called before ensurePreAuthorizedCode set a code.'
    )
  }
  const configId = deriveCredentialConfigurationId(exchange.variables.vc)
  return {
    credential_issuer: credentialIssuerUrlForExchange(exchange),
    credential_configuration_ids: [configId],
    grants: {
      [PRE_AUTHORIZED_GRANT]: { 'pre-authorized_code': code }
    }
  }
}
