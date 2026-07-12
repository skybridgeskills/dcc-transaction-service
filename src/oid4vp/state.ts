/**
 * Helpers that read + mutate `ExchangeDetailVerify.variables.oid4vp`,
 * the inline runtime state for the OID4VP 1.0 verifier binding.
 *
 * Each mutating helper returns the updated `ExchangeDetailVerify` so the
 * caller can persist it via {@link saveExchange} (Hono route handlers own
 * the I/O). Validators return a discriminated `Result` shape so handlers
 * can map cleanly to OID4VP error codes.
 *
 * State sub-object shape (see `app.d.ts` — {@link App.ExchangeOid4vpState}):
 *
 *   variables.oid4vp = { state, responseReceived }
 *
 * `nonce` is NOT stored here — it reuses the exchange's own `challenge`,
 * which verifier-core validates cryptographically against the VP proof.
 */
import { randomBytes } from 'node:crypto'

/**
 * Discriminated result type used by every validator. The `error` arm
 * carries an OID4VP error code so callers can pass it straight into the
 * spec-defined error response shape.
 */
export type Oid4vpStateResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: 'invalid_request'
      reason: string
    }

/**
 * Generate an opaque base64url `state` correlation token. 32 bytes is
 * comfortably above the 128-bit floor for unguessable tokens (mirrors
 * `oid4vci/codes.ts`).
 */
const generateState = (): string => randomBytes(32).toString('base64url')

/**
 * Idempotent lazy-init of the OID4VP state. If the exchange already has a
 * `state` token, return it unchanged; otherwise mint a single-use `state`
 * and stamp it on the exchange. Caller persists via `saveExchange` when
 * `isNew` is true.
 */
export const ensureOid4vpState = (
  exchange: App.ExchangeDetailVerify
): { exchange: App.ExchangeDetailVerify; isNew: boolean } => {
  const cur = exchange.variables.oid4vp
  if (cur?.state) {
    return { exchange, isNew: false }
  }
  const next: App.ExchangeDetailVerify = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vp: {
        ...(exchange.variables.oid4vp ?? {}),
        state: generateState(),
        responseReceived: false
      }
    }
  }
  return { exchange: next, isNew: true }
}

/**
 * Validate an inbound `state` against the exchange's issued token and
 * mark the response consumed (single-use / replay guard). On success sets
 * `responseReceived = true` and returns the mutated exchange for the
 * caller to persist.
 *
 * Returns `invalid_request` for: no request ever issued, a
 * missing/mismatched `state`, or a response already received (replay).
 */
export const consumeOid4vpResponse = (
  exchange: App.ExchangeDetailVerify,
  presentedState: string | undefined
): Oid4vpStateResult<{ exchange: App.ExchangeDetailVerify }> => {
  const cur = exchange.variables.oid4vp
  if (!cur?.state) {
    return {
      ok: false,
      error: 'invalid_request',
      reason: 'No OID4VP authorization request has been issued for this exchange.'
    }
  }
  if (cur.responseReceived) {
    return {
      ok: false,
      error: 'invalid_request',
      reason: 'An OID4VP response has already been accepted for this exchange.'
    }
  }
  if (!presentedState || presentedState !== cur.state) {
    return {
      ok: false,
      error: 'invalid_request',
      reason: 'The `state` value does not match the issued authorization request.'
    }
  }
  const next: App.ExchangeDetailVerify = {
    ...exchange,
    variables: {
      ...exchange.variables,
      oid4vp: { ...cur, responseReceived: true }
    }
  }
  return { ok: true, value: { exchange: next } }
}
