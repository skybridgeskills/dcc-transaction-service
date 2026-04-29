import { sign, verify } from 'hono/jwt'
import { getConfig } from '../config.js'
import { SCOPE_EXCHANGE_MANAGE, tokenHasScope } from './scopes.js'

export interface AccessJwtPayload {
  sub: string
  scope: string
  exp: number
}

const defaultExpiresInSec = 3600

export async function signAccessToken({
  tenantName,
  expiresInSec = defaultExpiresInSec
}: {
  tenantName: string
  expiresInSec?: number
}): Promise<string> {
  const secret = getConfig().accessJwtSecret
  if (!secret) {
    throw new Error('ACCESS_JWT_SECRET is not configured')
  }
  const exp = Math.floor(Date.now() / 1000) + expiresInSec
  const scope = SCOPE_EXCHANGE_MANAGE
  return sign({ sub: tenantName, scope, exp }, secret, 'HS256')
}

export async function verifyAccessToken(
  token: string
): Promise<AccessJwtPayload | null> {
  const secret = getConfig().accessJwtSecret
  if (!secret) {
    return null
  }
  try {
    const payload = (await verify(token, secret, 'HS256')) as unknown as AccessJwtPayload
    if (!payload?.sub || typeof payload.exp !== 'number') {
      return null
    }
    if (!tokenHasScope(payload.scope, SCOPE_EXCHANGE_MANAGE)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
