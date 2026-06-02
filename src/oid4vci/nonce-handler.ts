/**
 * Pure handler for the OID4VCI Nonce Endpoint (§7). Mints a fresh
 * single-use `c_nonce`, replacing any prior nonce on the exchange.
 *
 * Pure: caller persists the returned exchange via `saveExchange`.
 */
import { mintNonce } from './state.js'
import type { NonceResponse } from './schemas.js'

/** TTL of the issued nonce, in seconds. */
const NONCE_TTL_SECONDS = 300

export type NonceHandlerResult = {
  exchange: App.ExchangeDetailClaim
  response: NonceResponse
}

export const handleNonceRequest = (
  exchange: App.ExchangeDetailClaim
): NonceHandlerResult => {
  const minted = mintNonce(exchange, NONCE_TTL_SECONDS)
  return {
    exchange: minted.exchange,
    response: { c_nonce: minted.nonce }
  }
}
