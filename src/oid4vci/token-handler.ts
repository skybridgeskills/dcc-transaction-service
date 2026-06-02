/**
 * Pure handler for the OID4VCI Pre-Authorized Code Flow Token Endpoint
 * (§6). Accepts only `urn:ietf:params:oauth:grant-type:pre-authorized_code`
 * in this plan; other grant types fall through to a spec-defined error.
 *
 * Pure: I/O lives in the route handler in `hono.ts`. The caller is
 * responsible for persisting the returned exchange via `saveExchange`.
 */
import {
  PRE_AUTHORIZED_GRANT,
  tokenRequestSchema,
  type TokenErrorResponse,
  type TokenResponse
} from './schemas.js'
import { redeemPreAuthorizedCode, setAccessToken } from './state.js'

/** TTL of the issued OID4VCI access token, in seconds. */
const ACCESS_TOKEN_TTL_SECONDS = 600

export type TokenHandlerOk = {
  ok: true
  exchange: App.ExchangeDetailClaim
  response: TokenResponse
}
export type TokenHandlerErr = {
  ok: false
  status: 400
  body: TokenErrorResponse
}
export type TokenHandlerResult = TokenHandlerOk | TokenHandlerErr

const err = (
  error: TokenErrorResponse['error'],
  description: string
): TokenHandlerErr => ({
  ok: false,
  status: 400,
  body: { error, error_description: description }
})

/**
 * Handle a Token Request body parsed from the form-urlencoded request
 * payload at `POST /openid/token`. The first argument is the parsed
 * key/value object — we run our own zod validation inside.
 */
export const handleTokenRequest = (
  body: Record<string, unknown>,
  exchange: App.ExchangeDetailClaim
): TokenHandlerResult => {
  const parsed = tokenRequestSchema.safeParse(body)
  if (!parsed.success) {
    return err('invalid_request', 'Token request body is malformed.')
  }
  const { grant_type, 'pre-authorized_code': presented } = parsed.data
  if (grant_type !== PRE_AUTHORIZED_GRANT) {
    return err(
      'unsupported_grant_type',
      `Unsupported grant_type: ${grant_type}`
    )
  }
  if (!presented) {
    return err(
      'invalid_request',
      'pre-authorized_code is required for this grant type.'
    )
  }
  const redeemed = redeemPreAuthorizedCode(exchange, presented)
  if (!redeemed.ok) {
    return err(
      redeemed.error === 'invalid_request'
        ? 'invalid_request'
        : 'invalid_grant',
      redeemed.reason
    )
  }
  const minted = setAccessToken(
    redeemed.value.exchange,
    ACCESS_TOKEN_TTL_SECONDS
  )
  return {
    ok: true,
    exchange: minted.exchange,
    response: {
      access_token: minted.token,
      token_type: 'Bearer',
      expires_in: minted.expiresIn
    }
  }
}
