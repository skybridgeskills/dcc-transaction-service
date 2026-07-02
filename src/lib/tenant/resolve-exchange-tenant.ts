import { HTTPException } from 'hono/http-exception'

/**
 * Resolve the effective tenant for an exchange-create request.
 *
 * - Auth enabled (`authTenant` set): the token governs. A body `tenantName`
 *   that disagrees with the token tenant is a `401`. Returns
 *   `authTenant.tenantName`.
 * - Auth disabled (`authTenant` undefined): returns
 *   `bodyTenantName ?? defaultTenantName`.
 *
 * Presence of `authTenant` already encodes `tenantAuthenticationEnabled`: the
 * middleware only sets it when tenant auth is on.
 */
export function resolveExchangeTenant({
  bodyTenantName,
  authTenant,
  defaultTenantName
}: {
  bodyTenantName?: string
  authTenant?: App.Tenant
  defaultTenantName: string
}): string {
  if (authTenant) {
    if (bodyTenantName && bodyTenantName !== authTenant.tenantName) {
      throw new HTTPException(401, { message: 'Unauthorized' })
    }
    return authTenant.tenantName
  }
  return bodyTenantName ?? defaultTenantName
}
