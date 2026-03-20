import { sign, verify } from 'hono/jwt'
import { randomBytes } from 'crypto'
import {
  SCOPE_EXCHANGE_PARTICIPATE,
  tokenHasScope
} from '../../oauth/scopes.js'

const secret =
  process.env.EXCHANGE_JWT_SECRET || randomBytes(32).toString('hex')

export interface ExchangeTokenPayload {
  exchangeId: string
  workflowId: string
  exp: number
  scope?: string
}

export const signExchangeToken = async ({
  exchangeId,
  workflowId,
  expiresAt
}: {
  exchangeId: string
  workflowId: string
  expiresAt: string
}): Promise<string> => {
  const exp = Math.floor(new Date(expiresAt).getTime() / 1000)
  const scope = SCOPE_EXCHANGE_PARTICIPATE
  return sign({ exchangeId, workflowId, exp, scope }, secret)
}

export const verifyExchangeToken = async (
  token: string
): Promise<ExchangeTokenPayload | null> => {
  try {
    const payload = (await verify(token, secret, 'HS256')) as unknown as ExchangeTokenPayload
    if (
      payload?.scope != null &&
      payload.scope !== '' &&
      !tokenHasScope(payload.scope, SCOPE_EXCHANGE_PARTICIPATE)
    ) {
      return null
    }
    return payload
  } catch {
    return null
  }
}
