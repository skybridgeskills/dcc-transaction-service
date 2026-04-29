/** OAuth access tokens (client_credentials) for tenant API calls */
export const SCOPE_EXCHANGE_MANAGE = 'exchange:manage'

/** Exchange cookie JWT — browser participation / status UI */
export const SCOPE_EXCHANGE_PARTICIPATE = 'exchange:participate'

export function tokenHasScope(scopeClaim: string | undefined, scope: string): boolean {
  if (!scopeClaim?.trim()) {
    return false
  }
  const parts = scopeClaim.split(/\s+/).filter(Boolean)
  return parts.includes(scope)
}
