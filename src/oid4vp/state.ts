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
import { wireProfileForExchange } from '../protocol-profiles/for-exchange.js'

/**
 * Why the state guard refused, as a machine token.
 *
 * The wire collapses all three onto one `invalid_request`, which is correct —
 * a wallet has nothing to do differently for any of them, and saying more
 * would leak exchange state to an unbound caller. A *reader* needs the
 * difference: "no request was ever issued" and "this is a replay" are
 * different events with different owners, and reconstructing which one fired
 * by matching the prose is exactly the kind of derived fact that goes stale
 * the first time someone rewords a sentence.
 *
 * Named where it is detected, not re-derived where it is journalled.
 */
export const OID4VP_STATE_REJECTION_CAUSES = [
  /** No OID4VP authorization request has been issued for this exchange. */
  'no-request-issued',
  /** Single-use: a response has already been accepted. A replay. */
  'response-already-accepted',
  /** The presented `state` does not match the issued request. Unbound. */
  'state-mismatch'
] as const

export type Oid4vpStateRejectionCause =
  (typeof OID4VP_STATE_REJECTION_CAUSES)[number]

/**
 * Discriminated result type used by every validator. The `error` arm
 * carries an OID4VP error code so callers can pass it straight into the
 * spec-defined error response shape, and a `cause` so the journal can say
 * which check failed without parsing `reason`.
 */
export type Oid4vpStateResult<T> =
  | { ok: true; value: T }
  | {
      ok: false
      error: 'invalid_request'
      cause: Oid4vpStateRejectionCause
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
        responseReceived: false,
        // Stamped explicitly, never left implicit, so the exchange record
        // states which query language the request used.
        queryLanguage: resolveQueryLanguage(exchange),
        // Same discipline for the delivery arm: the record says how the
        // request reached the wallet, so a reader never has to infer it from
        // whether a `request_uri` GET happens to appear on the wire.
        delivery: resolveDelivery(exchange)
      }
    }
  }
  return { exchange: next, isNew: true }
}

/**
 * The query language this exchange asks in, defaulting to `dcql`.
 *
 * Read this rather than `variables.oid4vp?.queryLanguage` directly, so the
 * default lives in one place and callers cannot disagree about it.
 *
 * ⚠️ **Order: stamped value → explicit knob → active protocol profile → the
 * historical default.** The knob outranks the profile *during the migration
 * only* — a profile that outranked it would silently change what an in-flight
 * exchange emits, which is the one thing this work puts out of scope. See
 * `protocol-profiles/for-exchange.ts`.
 */
export const resolveQueryLanguage = (
  exchange: App.ExchangeDetailVerify
): App.Oid4vpQueryLanguage => {
  // ⚠️ This may return `both` — the query-language selector carries two
  // query languages in one request. It is returned rather than collapsed because
  // this value is what gets STAMPED on the exchange record and journalled, and
  // a record that said `dcql` for a request that also carried a
  // `presentation_definition` would be a quietly wrong attribution of exactly
  // the kind that is expensive to unpick later.
  return (
    exchange.variables.oid4vp?.queryLanguage ??
    exchange.variables.oid4vpQueryLanguage ??
    wireProfileForExchange(exchange)?.oid4vp?.queryLanguage ??
    'dcql'
  )
}

/**
 * How this exchange delivers the authorization request, defaulting to
 * `by-reference`.
 *
 * Read this rather than `variables.oid4vp?.delivery` directly, so the default
 * lives in one place and callers cannot disagree about it — the same rule
 * {@link resolveQueryLanguage} follows.
 *
 * ⚠️ **The default is the non-conformant arm, deliberately, and it still is.**
 * A `redirect_uri` client_id cannot be passed by reference under any published
 * OID4VP version (§5.9.3 forbids signing it; §5.10.1 / RFC 9101 require a
 * signed JWT at `request_uri`). `by-reference` remains the default ONLY so that
 * the comparison that names a wallet's refusal changes one variable. Flipping
 * it is a separate, evidenced decision.
 *
 * ⚠️ **The profile that IS this default is
 * `oid4vp-1.0-json-by-reference-dcql-redirect-uri`** — unsigned `application/
 * json` at `request_uri`, DCQL, `redirect_uri` prefix. One other by-reference
 * arm is selectable and it is NOT the default:
 *
 *   - ⚠️ the **conformant** arm
 *     (`oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier`),
 *     signed under a DID prefix — **conformant and unproven**. Its signature is
 *     forced to EdDSA where the mDL/EUDI default is ES256, so it may be *less*
 *     interoperable than this default.
 *
 * ⚠️ **No unsigned-JWT arm is selectable here, and none must be added.**
 * `docs/adr/2026-08-25-oid4vp-request-object-envelopes.md` §2 says why: `jwt`
 * means *signed* everywhere in this service, and an unsigned spelling would
 * silently reinterpret every place that says so.
 *
 * ⚠️ **Conformance is not a reason to move the default, and this is the site
 * that would be edited to do it.** Moving the default is a separate, evidenced
 * decision and needs a wallet that has actually accepted the replacement —
 * conformant and accepted are two columns.
 *
 * ⚠️ **Order: stamped value → explicit knob → active protocol profile → the
 * historical default**, for the reason given on {@link resolveQueryLanguage}.
 */
export const resolveDelivery = (
  exchange: App.ExchangeDetailVerify
): App.Oid4vpDelivery =>
  exchange.variables.oid4vp?.delivery ??
  exchange.variables.oid4vpDelivery ??
  wireProfileForExchange(exchange)?.oid4vp?.delivery ??
  'by-reference'

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
      cause: 'no-request-issued',
      reason: 'No OID4VP authorization request has been issued for this exchange.'
    }
  }
  if (cur.responseReceived) {
    return {
      ok: false,
      error: 'invalid_request',
      cause: 'response-already-accepted',
      reason: 'An OID4VP response has already been accepted for this exchange.'
    }
  }
  if (!presentedState || presentedState !== cur.state) {
    return {
      ok: false,
      error: 'invalid_request',
      cause: 'state-mismatch',
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
