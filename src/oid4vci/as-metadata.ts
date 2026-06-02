/**
 * Build the per-exchange OAuth Authorization Server Metadata document
 * (RFC 8414 + OID4VCI 1.0 §3.5). The metadata advertises this
 * service's per-exchange OID4VCI Token Endpoint and the
 * `urn:ietf:params:oauth:grant-type:pre-authorized_code` grant type.
 *
 * Distinct from the global tenant-API AS metadata served at
 * `/.well-known/oauth-authorization-server` (see `src/oauth/metadata.ts`).
 */
import { credentialIssuerUrlForExchange } from './credential-offer.js'
import { PRE_AUTHORIZED_GRANT, type Oid4vciAsMetadata } from './schemas.js'

export const buildOid4vciAsMetadata = (
  exchange: App.ExchangeDetailClaim
): Oid4vciAsMetadata => {
  const issuer = credentialIssuerUrlForExchange(exchange)
  return {
    issuer,
    token_endpoint: `${issuer}/openid/token`,
    grant_types_supported: [PRE_AUTHORIZED_GRANT],
    response_types_supported: [],
    token_endpoint_auth_methods_supported: ['none'],
    'pre-authorized_grant_anonymous_access_supported': true
  }
}
