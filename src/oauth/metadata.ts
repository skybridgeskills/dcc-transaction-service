/**
 * RFC 8414 OAuth 2.0 Authorization Server Metadata for this service.
 * @see https://www.rfc-editor.org/rfc/rfc8414.html
 */
export function oauthAuthorizationServerMetadata(
  config: App.Config
): Record<string, unknown> {
  const issuer = config.defaultExchangeHost.replace(/\/$/, '')
  return {
    issuer,
    token_endpoint: `${issuer}/oauth/token`,
    grant_types_supported: ['client_credentials'],
    token_endpoint_auth_methods_supported: ['client_secret_post'],
    response_types_supported: []
  }
}
