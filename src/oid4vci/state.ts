/**
 * Helpers that read + mutate `ExchangeDetailClaim.variables.oid4vci`,
 * the inline runtime state for the OID4VCI Pre-Authorized Code Flow.
 *
 * Each mutating helper returns the updated `ExchangeDetailClaim` so
 * the caller can persist it via {@link saveExchange} (Hono route
 * handlers own the I/O). Validators return a discriminated `Result`
 * shape so handlers can map cleanly to OID4VCI 1.0 spec error codes.
 *
 * State sub-object shape (see `app.d.ts`):
 *
 *   variables.oid4vci = {
 *     preAuthorizedCode, preAuthorizedCodeExpiresAt, codeUsed,
 *     accessToken, accessTokenExpiresAt,
 *     cNonce, cNonceExpiresAt, nonceUsed
 *   }
 */
import {
  generateAccessToken,
  generateCNonce,
  generatePreAuthorizedCode
} from './codes.js'

/**
 * Discriminated result type used by every validator. The `error` arm
 * carries an OID4VCI 1.0 spec error code so callers can pass it
 * straight into the spec-defined error response shape.
 */
export type StateResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error:
        | 'invalid_request'
        | 'invalid_grant'
        | 'invalid_token'
        | 'invalid_proof'
        | 'invalid_nonce'
        | 'unsupported_grant_type'
      reason: string
    }

const futureIso = (ttlSeconds: number): string =>
  new Date(Date.now() + ttlSeconds * 1000).toISOString()

const isExpired = (iso: string | undefined): boolean => {
  if (!iso) return true
  const t = new Date(iso).getTime()
  return Number.isNaN(t) || t <= Date.now()
}

/**
 * Idempotent: if the exchange already has an unused, unexpired
 * pre-authorized code, return the existing exchange unchanged. Otherwise
 * mint a new code, stamp it on the exchange, and return the updated
 * record. Caller is responsible for persisting via `saveExchange`.
 *
 * Returns the (possibly mutated) exchange and the code value to embed
 * in the credential offer.
 */
export const ensurePreAuthorizedCode = (
  exchange: App.ExchangeDetailClaim,
  ttlSeconds: number
): { exchange: App.ExchangeDetailClaim; code: string; isNew: boolean } => {
  const cur = exchange.variables.oid4vci
  if (
    cur?.preAuthorizedCode &&
    !cur.codeUsed &&
    !isExpired(cur.preAuthorizedCodeExpiresAt)
  ) {
    return { exchange, code: cur.preAuthorizedCode, isNew: false }
  }
  const code = generatePreAuthorizedCode()
  const next: App.ExchangeDetailClaim = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vci: {
        ...(exchange.variables.oid4vci ?? {}),
        preAuthorizedCode: code,
        preAuthorizedCodeExpiresAt: futureIso(ttlSeconds),
        codeUsed: false
      }
    }
  }
  return { exchange: next, code, isNew: true }
}

/**
 * One-shot: validates `presented` against the exchange's current
 * pre-authorized code, expiry, and used flag. On success, marks the
 * code used and returns the updated exchange. On failure, returns
 * `invalid_grant` (for unknown / wrong / replayed / expired) or
 * `invalid_request` (no code on file because the offer was never
 * fetched).
 */
export const redeemPreAuthorizedCode = (
  exchange: App.ExchangeDetailClaim,
  presented: string
): StateResult<{ exchange: App.ExchangeDetailClaim }> => {
  const cur = exchange.variables.oid4vci
  if (!cur?.preAuthorizedCode) {
    return {
      ok: false,
      error: 'invalid_request',
      reason: 'No pre-authorized code has been issued for this exchange.'
    }
  }
  if (cur.codeUsed) {
    return {
      ok: false,
      error: 'invalid_grant',
      reason: 'Pre-authorized code has already been redeemed.'
    }
  }
  if (isExpired(cur.preAuthorizedCodeExpiresAt)) {
    return {
      ok: false,
      error: 'invalid_grant',
      reason: 'Pre-authorized code has expired.'
    }
  }
  if (cur.preAuthorizedCode !== presented) {
    return {
      ok: false,
      error: 'invalid_grant',
      reason: 'Pre-authorized code is invalid.'
    }
  }
  const next: App.ExchangeDetailClaim = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vci: { ...cur, codeUsed: true }
    }
  }
  return { ok: true, value: { exchange: next } }
}

/**
 * Stamp a freshly-minted access token + expiry onto the exchange. The
 * token value itself is generated outside this helper so callers can
 * return it to the wallet without re-reading the exchange.
 */
export const setAccessToken = (
  exchange: App.ExchangeDetailClaim,
  ttlSeconds: number
): { exchange: App.ExchangeDetailClaim; token: string; expiresIn: number } => {
  const token = generateAccessToken()
  const next: App.ExchangeDetailClaim = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vci: {
        ...(exchange.variables.oid4vci ?? {}),
        accessToken: token,
        accessTokenExpiresAt: futureIso(ttlSeconds)
      }
    }
  }
  return { exchange: next, token, expiresIn: ttlSeconds }
}

/**
 * Validate the bearer access token presented at the credential
 * endpoint against the exchange's stored token. Returns
 * `invalid_token` (RFC 6750) on any mismatch / expiry / absence.
 *
 * Pure read — does not mutate. Tokens stay valid for their lifetime
 * even after they're used, so the same token can drive multiple
 * credential requests if the wallet asks for several proofs in
 * sequence (a future use; this plan accepts a single proof per
 * request).
 */
export const validateAccessToken = (
  exchange: App.ExchangeDetailClaim,
  presented: string
): StateResult<true> => {
  const cur = exchange.variables.oid4vci
  if (!cur?.accessToken) {
    return {
      ok: false,
      error: 'invalid_token',
      reason: 'No access token has been issued for this exchange.'
    }
  }
  if (isExpired(cur.accessTokenExpiresAt)) {
    return {
      ok: false,
      error: 'invalid_token',
      reason: 'Access token has expired.'
    }
  }
  if (cur.accessToken !== presented) {
    return {
      ok: false,
      error: 'invalid_token',
      reason: 'Access token does not match.'
    }
  }
  return { ok: true, value: true }
}

/**
 * Mint a fresh `c_nonce`, replacing any prior nonce on the exchange.
 * The newly issued nonce starts as unused; the credential endpoint
 * marks it used via {@link validateAndConsumeNonce}.
 */
export const mintNonce = (
  exchange: App.ExchangeDetailClaim,
  ttlSeconds: number
): { exchange: App.ExchangeDetailClaim; nonce: string } => {
  const nonce = generateCNonce()
  const next: App.ExchangeDetailClaim = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vci: {
        ...(exchange.variables.oid4vci ?? {}),
        cNonce: nonce,
        cNonceExpiresAt: futureIso(ttlSeconds),
        nonceUsed: false
      }
    }
  }
  return { exchange: next, nonce }
}

/**
 * Validate `presented` against the exchange's current `c_nonce`,
 * including expiry and used-once enforcement. On success, marks the
 * nonce used (single-use) and returns the updated exchange.
 *
 * Returns `invalid_nonce` per OID4VCI 1.0 §8.3.1.2 for any
 * mismatch / expiry / replay.
 */
export const validateAndConsumeNonce = (
  exchange: App.ExchangeDetailClaim,
  presented: string
): StateResult<{ exchange: App.ExchangeDetailClaim }> => {
  const cur = exchange.variables.oid4vci
  if (!cur?.cNonce) {
    return {
      ok: false,
      error: 'invalid_nonce',
      reason: 'No nonce has been issued for this exchange.'
    }
  }
  if (cur.nonceUsed) {
    return {
      ok: false,
      error: 'invalid_nonce',
      reason: 'Nonce has already been consumed.'
    }
  }
  if (isExpired(cur.cNonceExpiresAt)) {
    return {
      ok: false,
      error: 'invalid_nonce',
      reason: 'Nonce has expired.'
    }
  }
  if (cur.cNonce !== presented) {
    return {
      ok: false,
      error: 'invalid_nonce',
      reason: 'Nonce does not match.'
    }
  }
  const next: App.ExchangeDetailClaim = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vci: { ...cur, nonceUsed: true }
    }
  }
  return { ok: true, value: { exchange: next } }
}
