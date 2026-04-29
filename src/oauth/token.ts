import type { Context } from 'hono'
import { getConfig } from '../config.js'
import { signAccessToken } from './accessJwt.js'

const defaultExpiresInSec = 3600

function oauthError(c: Context, status: 400 | 401 | 503, error: string, description?: string) {
  return c.json(
    {
      error,
      ...(description ? { error_description: description } : {})
    },
    status
  )
}

/**
 * OAuth 2.0 client_credentials token endpoint (form body).
 */
export async function handleOAuthTokenPost(c: Context) {
  const config = getConfig()
  const contentType = c.req.header('content-type') ?? ''
  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return oauthError(
      c,
      400,
      'invalid_request',
      'Content-Type must be application/x-www-form-urlencoded'
    )
  }

  if (!config.accessJwtSecret) {
    return oauthError(
      c,
      503,
      'server_error',
      'OAuth access tokens are not configured (ACCESS_JWT_SECRET)'
    )
  }

  const body = await c.req.parseBody()
  const grantType = String(body['grant_type'] ?? '')
  const clientIdRaw = body['client_id']
  const clientSecretRaw = body['client_secret']
  const clientId = typeof clientIdRaw === 'string' ? clientIdRaw : ''
  const clientSecret = typeof clientSecretRaw === 'string' ? clientSecretRaw : ''

  if (grantType !== 'client_credentials') {
    return oauthError(
      c,
      400,
      'unsupported_grant_type',
      'Only grant_type=client_credentials is supported'
    )
  }

  if (!clientId || !clientSecret) {
    return oauthError(c, 400, 'invalid_request', 'client_id and client_secret are required')
  }

  const tenantName = clientId.toLowerCase()
  const tenant = config.tenants[tenantName]
  if (!tenant || tenant.tenantToken !== clientSecret) {
    return oauthError(c, 401, 'invalid_client', 'Invalid client credentials')
  }

  const access_token = await signAccessToken({
    tenantName: tenant.tenantName,
    expiresInSec: defaultExpiresInSec
  })

  return c.json({
    access_token,
    token_type: 'Bearer',
    expires_in: defaultExpiresInSec
  })
}
