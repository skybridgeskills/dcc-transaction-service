import { sign, verify } from 'hono/jwt'
import { randomBytes } from 'crypto'

const secret =
  process.env.EXCHANGE_JWT_SECRET || randomBytes(32).toString('hex')

export interface ExchangeTokenPayload {
  exchangeId: string
  workflowId: string
  exp: number
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
  return sign({ exchangeId, workflowId, exp }, secret)
}

export const verifyExchangeToken = async (
  token: string
): Promise<ExchangeTokenPayload | null> => {
  try {
    const payload = (await verify(token, secret, 'HS256')) as unknown as ExchangeTokenPayload
    return payload
  } catch {
    return null
  }
}
