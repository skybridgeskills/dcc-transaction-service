/**
 * Pure handler for the OID4VP 1.0 `direct_post` response endpoint
 * (§8.2). Parses the DCQL `vp_token`, binds it to the exchange
 * (`state`/replay guard + `client_id`↔VP `domain` audience check),
 * extracts the presentation, and defers to the existing verify pipeline
 * (`participateInVerifyExchange`) so the exchange finalizes exactly like
 * the VC-API path — including the async Open Badges pass.
 *
 * The VP proof's `nonce`/`challenge` is validated cryptographically by
 * verifier-core against `exchange.variables.challenge` (= our request
 * `nonce`); this handler additionally enforces the `domain` audience
 * binding, which verifier-core does not check.
 *
 * Spec anchors: §8.2 (`direct_post`), §14 (DCQL `vp_token` object keyed
 * by query id; VP `nonce` = request nonce, VP `aud`/`domain` = client_id),
 * §14.3 (`direct_post` security).
 */
import { HTTPException } from 'hono/http-exception'
import { participateInVerifyExchange } from '../workflows/verifyWorkflow.js'
import { clientIdForExchange } from './authorization-request.js'
import {
  directPostResponseSchema,
  type Oid4vpErrorCode,
  type Oid4vpErrorResponse
} from './schemas.js'
import { consumeOid4vpResponse } from './state.js'

export type Oid4vpResponseOk = {
  ok: true
  status: 200
  /** Persisted, finalized exchange (already saved by the verify pipeline). */
  exchange: App.ExchangeDetailVerify
  response: Record<string, unknown>
}

export type Oid4vpResponseErr = {
  ok: false
  status: 400
  body: Oid4vpErrorResponse
}

export type Oid4vpResponseResult = Oid4vpResponseOk | Oid4vpResponseErr

const err = (
  error: Oid4vpErrorCode,
  description: string
): Oid4vpResponseErr => ({
  ok: false,
  status: 400,
  body: { error, error_description: description }
})

/** Normalize a Data Integrity `proof` field to an array of proof objects. */
const proofsOf = (vp: Record<string, unknown>): Record<string, unknown>[] => {
  const proof = vp.proof
  if (Array.isArray(proof)) return proof.filter((p) => !!p && typeof p === 'object')
  if (proof && typeof proof === 'object') return [proof as Record<string, unknown>]
  return []
}

/**
 * True when some proof on the VP commits to `expectedClientId` as its
 * `domain` (a proof `domain` MAY be a single string or an array of
 * strings per the Data Integrity spec).
 */
const bindsAudience = (
  vp: Record<string, unknown>,
  expectedClientId: string
): boolean =>
  proofsOf(vp).some((p) => {
    const domain = p.domain
    if (Array.isArray(domain)) return domain.includes(expectedClientId)
    return domain === expectedClientId
  })

/**
 * Coerce the wallet POST body (JSON or form-urlencoded) into the shape
 * {@link directPostResponseSchema} expects. In a form post, `vp_token`
 * arrives as a JSON string and must be parsed first.
 */
const coerceBody = (body: unknown): unknown => {
  if (!body || typeof body !== 'object') return body
  const record = body as Record<string, unknown>
  const rawToken = record.vp_token
  let vp_token: unknown = rawToken
  if (typeof rawToken === 'string') {
    try {
      vp_token = JSON.parse(rawToken)
    } catch {
      vp_token = rawToken // leave as-is; schema validation will reject it
    }
  }
  return { vp_token, ...(record.state !== undefined ? { state: record.state } : {}) }
}

export const handleOid4vpResponse = async ({
  body,
  exchange,
  workflow,
  config
}: {
  body: unknown
  exchange: App.ExchangeDetailVerify
  workflow: App.Workflow
  config: App.Config
}): Promise<Oid4vpResponseResult> => {
  // 1. Parse + validate the direct_post body.
  const parsed = directPostResponseSchema.safeParse(coerceBody(body))
  if (!parsed.success) {
    return err(
      'invalid_request',
      'Malformed direct_post response: expected a DCQL `vp_token` object.'
    )
  }

  // 2. State / single-use replay guard.
  const consumed = consumeOid4vpResponse(exchange, parsed.data.state)
  if (!consumed.ok) {
    return err(consumed.error, consumed.reason)
  }
  const working = consumed.value.exchange

  // 3. Extract the presentation from the DCQL vp_token (object keyed by
  //    credential-query id). For this binding exactly one query is issued;
  //    take the first entry's first presentation.
  const presentations = Object.values(parsed.data.vp_token)[0]
  const vp = presentations?.[0]
  if (!vp || typeof vp !== 'object') {
    return err('invalid_presentation', 'vp_token contained no presentation.')
  }
  const presentation = vp as Record<string, unknown>

  // 4. Audience binding: the VP proof MUST commit to our client_id as its
  //    `domain` (verifier-core does not enforce this; we must).
  if (!bindsAudience(presentation, clientIdForExchange(working))) {
    return err(
      'invalid_presentation',
      'Presentation proof `domain` does not match the request `client_id`.'
    )
  }

  // 5. Reuse the existing verify pipeline. It applies compat fixes,
  //    structural validation, verifier-core (which checks the VP proof
  //    `challenge` against the exchange `challenge`/nonce),
  //    trusted-issuer/registry + claims checks, the async OB pass, and
  //    persists the finalized exchange (carrying our responseReceived=true).
  try {
    await participateInVerifyExchange({
      data: presentation,
      exchange: working,
      workflow,
      config
    })

    // 6. OID4VP direct_post success. Use snake_case `redirect_uri` per the
    //    OID4VP response conventions (the VC-API path returns camelCase
    //    `redirectUrl`).
    const redirectUrl = working.variables.redirectUrl
    return {
      ok: true,
      status: 200,
      exchange: working,
      response: redirectUrl ? { redirect_uri: redirectUrl } : {}
    }
  } catch (e) {
    // preparePresentationForVerify throws HTTPException(400) on structural
    // problems; surface those as an OID4VP error rather than leaking the
    // VC-API HTTPException JSON shape.
    if (e instanceof HTTPException && e.status === 400) {
      return err('invalid_presentation', e.message)
    }
    throw e
  }
}
