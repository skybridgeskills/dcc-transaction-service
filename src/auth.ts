import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { getConfig } from './config.js'
import { HTTPException } from 'hono/http-exception'
import { verifyAccessToken } from './oauth/accessJwt.js'
import { verifyExchangeToken } from './lib/server/exchangeToken.js'

function tenantKey(name: string): string {
  return name.toLowerCase()
}

function parseBasicAuthCredentials(
  authHeader: string
): { user: string; password: string } | null {
  const [scheme, encoded] = authHeader.split(' ')
  if (scheme !== 'Basic' || !encoded) {
    return null
  }
  try {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8')
    const colon = decoded.indexOf(':')
    if (colon < 1) {
      return null
    }
    return {
      user: decoded.slice(0, colon),
      password: decoded.slice(colon + 1)
    }
  } catch {
    return null
  }
}

export const getTenant = async ({
  tenantName,
  tenantToken
}: {
  tenantName?: string
  tenantToken?: string
}): Promise<App.Tenant | undefined> => {
  const config = getConfig()
  if (!config.tenantAuthenticationEnabled) {
    return undefined
  }

  if (tenantName && !tenantToken) {
    return config.tenants[tenantKey(tenantName)]
  }
  if (tenantToken && !tenantName) {
    return Object.values(config.tenants).find(
      (t) => t.tenantToken === tenantToken
    )
  }
  if (tenantName && tenantToken) {
    const t = config.tenants[tenantKey(tenantName)]
    if (t?.tenantToken === tenantToken) {
      return t
    }
  }
  return undefined
}

export const authenticateTenant = async (
  tenantToken: string
): Promise<App.Tenant | undefined> => {
  const config = getConfig()
  if (!config.tenantAuthenticationEnabled) {
    return
  }

  // If no auth header is set and no tenants are configured, use the default tenant
  // without authentication.
  if (tenantToken === undefined && config.tenants[config.defaultTenantName]) {
    return config.tenants[config.defaultTenantName]
  }

  const accessPayload = await verifyAccessToken(tenantToken)
  if (accessPayload) {
    return config.tenants[accessPayload.sub.toLowerCase()]
  }

  const tenant = await getTenant({ tenantToken })
  return tenant
}

async function tenantFromAuthorizationHeader(
  authorization: string | undefined
): Promise<App.Tenant | undefined> {
  if (!authorization) {
    return undefined
  }
  const [scheme] = authorization.split(' ')
  if (scheme === 'Basic') {
    const creds = parseBasicAuthCredentials(authorization)
    if (!creds) {
      return undefined
    }
    return getTenant({
      tenantName: creds.user,
      tenantToken: creds.password
    })
  }
  if (scheme === 'Bearer') {
    const token = authorization.split(' ')[1]
    return authenticateTenant(token ?? '')
  }
  return undefined
}

export const authenticateTenantMiddleware = createMiddleware<{
  Variables: {
    authTenant?: App.Tenant
  }
}>(async (c, next) => {
  const config = getConfig()
  if (!config.tenantAuthenticationEnabled) {
    await next()
    return
  }

  const tenant = await tenantFromAuthorizationHeader(
    c.req.header('Authorization')
  )

  if (!tenant) {
    throw new HTTPException(401, {
      message:
        'Unauthorized. Use Bearer <token> or Basic <base64(tenant:secret)>.'
    })
  }

  c.set('authTenant', tenant)
  await next()
})

/**
 * Middleware that accepts either an exchange-scoped JWT cookie or a tenant
 * Bearer token. The cookie path is tried first; if it succeeds the request
 * proceeds with `exchangeTokenAuth` set to true, skipping tenant checks.
 */
export const authenticateExchangeOrTenantMiddleware = createMiddleware<{
  Variables: {
    authTenant?: App.Tenant
    exchangeTokenAuth?: boolean
  }
}>(async (c, next) => {
  const token = getCookie(c, 'exchange_token')
  if (token) {
    const payload = await verifyExchangeToken(token)
    if (
      payload &&
      payload.exchangeId === c.req.param('exchangeId') &&
      payload.workflowId === c.req.param('workflowId')
    ) {
      c.set('exchangeTokenAuth', true)
      await next()
      return
    }
    throw new HTTPException(401, {
      message: 'Invalid or insufficient exchange token'
    })
  }

  const config = getConfig()
  if (!config.tenantAuthenticationEnabled) {
    await next()
    return
  }

  const tenant = await tenantFromAuthorizationHeader(
    c.req.header('Authorization')
  )
  if (!tenant) {
    throw new HTTPException(401, {
      message:
        'Unauthorized. Use Bearer <token> or Basic <base64(tenant:secret)>.'
    })
  }

  c.set('authTenant', tenant)
  await next()
})
