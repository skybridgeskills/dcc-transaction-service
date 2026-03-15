import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { getConfig } from './config.js'
import { HTTPException } from 'hono/http-exception'
import { verifyExchangeToken } from './lib/server/exchangeToken.js'

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
    return config.tenants[tenantName]
  }
  if (tenantToken && !tenantName) {
    return Object.values(config.tenants).find(
      (t) => t.tenantToken === tenantToken
    )
  }
  if (
    tenantName &&
    tenantToken &&
    config.tenants[tenantName].tenantToken === tenantToken
  ) {
    return config.tenants[tenantName]
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

  const tenant = await getTenant({ tenantToken })
  return tenant
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

  const authHeader = c.req.header('Authorization')?.split(' ')
  if (!authHeader || authHeader.length !== 2 || authHeader[0] !== 'Bearer') {
    throw new HTTPException(401, {
      message: 'Improperly formatted Bearer token'
    })
  }
  const tenant = await authenticateTenant(authHeader[1])

  if (!tenant) {
    throw new HTTPException(401, { message: 'Unauthorized' })
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
    throw new HTTPException(401, { message: 'Invalid exchange token' })
  }

  const config = getConfig()
  if (!config.tenantAuthenticationEnabled) {
    await next()
    return
  }

  const authHeader = c.req.header('Authorization')?.split(' ')
  if (!authHeader || authHeader.length !== 2 || authHeader[0] !== 'Bearer') {
    throw new HTTPException(401, {
      message: 'Unauthorized'
    })
  }
  const tenant = await authenticateTenant(authHeader[1])
  if (!tenant) {
    throw new HTTPException(401, { message: 'Unauthorized' })
  }

  c.set('authTenant', tenant)
  await next()
})
