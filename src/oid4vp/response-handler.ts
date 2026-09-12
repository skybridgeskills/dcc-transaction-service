/**
 * Pure handler for the OID4VP 1.0 `direct_post` response endpoint
 * (§8.2). Parses the `vp_token` in whichever query language the exchange
 * asked in — DCQL or Presentation Exchange — binds it to the exchange
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
 * The endpoint also accepts the other message a wallet may legally send
 * here: an OID4VP **error response** reporting the wallet's own failure
 * (§5.10). See {@link acceptWalletError} — it is a distinct conformant
 * message, recognised as such, and not an exception to the rule below
 * about responses in the wrong shape.
 *
 * Every rejection this handler makes is journalled with a reason of its own
 * (see {@link rejectPresentation}), so the record never carries the wallet's
 * account of a failure without also carrying ours.
 *
 * Spec anchors: §8.2 (`direct_post`), §14 (DCQL `vp_token` object keyed
 * by query id; VP `nonce` = request nonce, VP `aud`/`domain` = client_id),
 * §14.3 (`direct_post` security), §5.10 (error response).
 */
import { HTTPException } from 'hono/http-exception'
import { participateInVerifyExchange } from '../workflows/verifyWorkflow.js'
import { saveExchange } from '../transactionManager.js'
import { journalExchangeEvent } from '../journal/index.js'
import { clientIdForExchange } from './authorization-request.js'
import {
  directPostResponseSchema,
  directPostPexResponseSchema,
  walletErrorResponseSchema,
  type DirectPostResponse,
  type DirectPostPexResponse,
  type Oid4vpErrorCode,
  type Oid4vpErrorResponse,
  type WalletErrorResponse
} from './schemas.js'
import { consumeOid4vpResponse, resolveQueryLanguage } from './state.js'

export type Oid4vpResponseOk = {
  ok: true
  status: 200
  outcome: 'presentation'
  /** Persisted, finalized exchange (already saved by the verify pipeline). */
  exchange: App.ExchangeDetailVerify
  response: Record<string, unknown>
}

/**
 * The wallet reported its own failure with a conformant OID4VP error response
 * and we accepted it. A 200 on the wire, and a terminated exchange — the
 * exchange did not succeed, but nothing about *our* handling went wrong.
 */
export type Oid4vpResponseWalletError = {
  ok: true
  status: 200
  outcome: 'wallet-error'
  /** Persisted exchange, terminated `invalid`. */
  exchange: App.ExchangeDetailVerify
  response: Record<string, unknown>
  /** The wallet's own diagnosis, as sent. */
  walletError: WalletErrorResponse
}

export type Oid4vpResponseErr = {
  ok: false
  status: 400
  body: Oid4vpErrorResponse
}

export type Oid4vpResponseResult =
  | Oid4vpResponseOk
  | Oid4vpResponseWalletError
  | Oid4vpResponseErr

/**
 * Why *we* rejected a presentation, as journalled.
 *
 * A closed set, for the same reason `JournalEvent` is one: a reader who has
 * not read this file still has to be able to trust the shape. Each arm names
 * the check that failed, and the arms are the four `invalid_presentation`
 * returns below — every one of them, so that no rejection of ours is silent.
 *
 * These are journal reasons, never wire codes: OID4VP §5.10 gives a wallet
 * `invalid_presentation` and nothing finer, and widening what we put on the
 * wire would be a conformance defect dressed up as diagnostics.
 */
export const PRESENTATION_REJECTION_REASONS = [
  /** PEX: `presentation_submission` descriptor_map path resolved to nothing. */
  'presentation-path-unresolved',
  /** `vp_token` parsed, but carried no presentation object. */
  'no-presentation-in-vp-token',
  /** VP proof `domain` did not commit to this exchange's `client_id`. */
  'audience-binding-failed',
  /** The verify pipeline refused it (structure, proof, issuer or claims). */
  'presentation-verification-failed'
] as const

export type PresentationRejectionReason =
  (typeof PRESENTATION_REJECTION_REASONS)[number]

/**
 * Why *we* refused the request itself, as journalled.
 *
 * The sibling of {@link PresentationRejectionReason}, and deliberately not the
 * same set: on two of these three paths **no presentation was involved at
 * all**, so a name implying one would misdescribe the event.
 *
 * These were the last silent rejections on this path. They are a quieter
 * defect than the inversion `rejectPresentation` fixed — they do not make a
 * reader attribute a failure to the wrong party, they leave the reader with
 * nothing to attribute it to at all — but quieter is not harmless, and **it
 * lands hardest on the wallet with the thinnest evidence**. A wire-only
 * wallet with neither wire nor log fails earlier than the rest; failing early
 * is precisely how you land on one of these. For that wallet the journal is
 * not one channel among three, it is the only one, so an unrecorded rejection
 * there is not a thin record but no record — and the architecture-neutrality
 * rule (*a wallet that emits less must not be read as doing worse for
 * emitting less*) breaks exactly when our own record emits less for it too.
 *
 * The three state-guard causes are carried through from where they are
 * detected rather than re-derived here; see `OID4VP_STATE_REJECTION_CAUSES`.
 */
export const REQUEST_REJECTION_REASONS = [
  /** The direct_post body did not parse in the language this exchange asked in. */
  'malformed-direct-post-body',
  /** No OID4VP authorization request has been issued for this exchange. */
  'no-request-issued',
  /** Single-use: a response has already been accepted. A replay. */
  'response-already-accepted',
  /** The presented `state` does not match the issued request. Unbound. */
  'state-mismatch'
] as const

export type RequestRejectionReason =
  (typeof REQUEST_REJECTION_REASONS)[number]

/**
 * Which message the state guard was protecting when it fired.
 *
 * The guard is one check run on two different messages, so the *cause* and the
 * *message* are independent facts and the reader wants both. Collapsing them —
 * either one shared reason for both sites, or a distinct reason per site —
 * would lose one axis to keep the other.
 *
 * Absent on the malformed-body path by construction: the body did not parse,
 * so which message it was meant to be is not known and must not be guessed.
 */
type GuardedMessage = 'wallet-error-report' | 'presentation'

const err = (
  error: Oid4vpErrorCode,
  description: string
): Oid4vpResponseErr => ({
  ok: false,
  status: 400,
  body: { error, error_description: description }
})

/**
 * Reject a presentation *and say so in the journal*.
 *
 * The journal's one job is attribution, and on this path it was getting it
 * backwards. `acceptWalletError` journals the wallet's own account of its
 * failure; every rejection of OURS journalled nothing at all. So an exchange
 * where a wallet sent a presentation and **we** turned it down left a record
 * containing only the wallet's earlier words — and a reader with no other
 * source would attribute the failure to the client, when it was ours. That
 * sequence is ordinary rather than exotic: a client may report an error and
 * then, moments later, send a presentation that we are the ones to turn down.
 *
 * The fields mirror the wallet-error line deliberately — same `stage`, same
 * `error`/`error_description` pair — so the two are read side by side and the
 * only thing separating them is `reason`: whose account this is. The
 * OID4VCI credential path has journalled its own 400 all along; this is the
 * OID4VP half of the same rule.
 *
 * `reason` is finer-grained than the wire's single `invalid_presentation`
 * code, because the wire code is what the wallet needs and the reason is what
 * a later reader needs.
 */
const rejectPresentation = (
  exchange: Pick<
    App.ExchangeDetailVerify,
    'exchangeId' | 'workflowId' | 'tenantName'
  >,
  reason: PresentationRejectionReason,
  description: string
): Oid4vpResponseErr => {
  journalExchangeEvent(exchange, 'error', {
    stage: 'oid4vp-direct-post',
    reason,
    error: 'invalid_presentation',
    error_description: description
  })
  return err('invalid_presentation', description)
}

/**
 * Reject the request *and say so in the journal*.
 *
 * `rejectPresentation`'s sibling for `invalid_request`. Same mirrored fields —
 * `stage`, `error`, `error_description` — so every line on this path reads
 * side by side and `reason` alone says whose account it is and which check
 * fired.
 *
 * The wire response is unchanged: same code, same description. The wallet sees
 * exactly what it saw before; the difference is entirely in the record.
 */
const rejectRequest = (
  exchange: Pick<
    App.ExchangeDetailVerify,
    'exchangeId' | 'workflowId' | 'tenantName'
  >,
  reason: RequestRejectionReason,
  description: string,
  guarding?: GuardedMessage
): Oid4vpResponseErr => {
  journalExchangeEvent(exchange, 'error', {
    stage: 'oid4vp-direct-post',
    reason,
    error: 'invalid_request',
    error_description: description,
    ...(guarding !== undefined ? { guarding } : {})
  })
  return err('invalid_request', description)
}

/** Normalize a Data Integrity `proof` field to an array of proof objects. */
const proofsOf = (vp: Record<string, unknown>): Record<string, unknown>[] => {
  const proof = vp.proof
  if (Array.isArray(proof))
    return proof.filter((p) => !!p && typeof p === 'object')
  if (proof && typeof proof === 'object')
    return [proof as Record<string, unknown>]
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
  // `presentation_submission` arrives JSON-encoded in a form post too.
  const rawSubmission = record.presentation_submission
  let presentation_submission: unknown = rawSubmission
  if (typeof rawSubmission === 'string') {
    try {
      presentation_submission = JSON.parse(rawSubmission)
    } catch {
      presentation_submission = rawSubmission
    }
  }
  return {
    vp_token,
    ...(rawSubmission !== undefined ? { presentation_submission } : {}),
    ...(record.state !== undefined ? { state: record.state } : {})
  }
}

/**
 * Resolve a PEX `descriptor_map` path to a node inside the `vp_token`.
 *
 * Support is deliberately minimal — `$`, `$[n]`, and dotted/bracketed
 * member access such as `$.verifiableCredential[0]`. A general JSONPath
 * evaluator is a dependency and an attack surface this service does not
 * need, and a wallet emitting something outside this set is a finding worth
 * surfacing rather than something to silently accommodate.
 *
 * Returns `undefined` when the path is unsupported or resolves to nothing;
 * the caller reports the path verbatim.
 */
export const resolveJsonPath = (root: unknown, path: string): unknown => {
  if (path === '$') return root
  const rest = path.startsWith('$') ? path.slice(1) : path
  const tokens = rest.match(/\[\s*'([^']*)'\s*\]|\[\s*(\d+)\s*\]|\.([^.[\]]+)/g)
  if (!tokens) return undefined
  let node: unknown = root
  for (const token of tokens) {
    if (node === null || node === undefined) return undefined
    const quoted = token.match(/^\[\s*'([^']*)'\s*\]$/)
    const index = token.match(/^\[\s*(\d+)\s*\]$/)
    const member = token.match(/^\.([^.[\]]+)$/)
    if (quoted) {
      node = (node as Record<string, unknown>)[quoted[1]!]
    } else if (index) {
      if (!Array.isArray(node)) return undefined
      node = node[Number(index[1])]
    } else if (member) {
      node = (node as Record<string, unknown>)[member[1]!]
    } else {
      return undefined
    }
  }
  return node
}

/**
 * Accept a conformant OID4VP error response the wallet sent instead of a
 * presentation.
 *
 * ## Why this is accepted at all
 *
 * A wallet that correctly reports its own failure — `access_denied`, "no
 * matching credentials found" — used to receive a `400 invalid_request` from
 * us, because the body did not parse as a presentation response. Its diagnosis
 * was then lost, and the record showed only that something at this endpoint had
 * gone wrong. **That was our non-conformance, not the wallet's**: it sent a
 * legal message and we rejected it.
 *
 * This is the single place in this build where wire behaviour changes to make
 * something visible, and it is justified on those grounds alone. Everywhere
 * else, causes go to the journal and the wallet sees exactly what it saw
 * before.
 *
 * ## What it does
 *
 * Binds through the same `state` / single-use guard the success path uses (an
 * unbound error report is no more admissible than an unbound presentation),
 * journals the wallet's own words verbatim, and terminates the exchange
 * `invalid` — the state stays a wallet-reported failure rather than a
 * malformed request only in the journal, deliberately: `ExchangeState` has no
 * arm for "the counterparty declined", and inventing one would change what
 * every existing polling client sees.
 */
const acceptWalletError = async (
  report: WalletErrorResponse,
  exchange: App.ExchangeDetailVerify
): Promise<Oid4vpResponseResult> => {
  const consumed = consumeOid4vpResponse(exchange, report.state)
  if (!consumed.ok) {
    // Runs BEFORE the wallet-error line is journalled, so without this an
    // unbound or replayed wallet error report vanished from the record
    // entirely — and that report is the one event on this path that could
    // have come from someone other than the wallet.
    return rejectRequest(
      exchange,
      consumed.cause,
      consumed.reason,
      'wallet-error-report'
    )
  }

  // Verbatim. This is the wallet's own account of why it failed, and it is
  // the single most valuable line in the record — a paraphrase of it, or a
  // mapping onto our own error vocabulary, would destroy the only evidence
  // that distinguishes "the wallet could not find a matching credential" from
  // "the wallet rejected our request".
  journalExchangeEvent(exchange, 'error', {
    stage: 'oid4vp-direct-post',
    reason: 'wallet-reported-error',
    error: report.error,
    ...(report.error_description !== undefined
      ? { error_description: report.error_description }
      : {}),
    ...(report.error_uri !== undefined ? { error_uri: report.error_uri } : {})
  })

  const terminated: App.ExchangeDetailVerify = {
    ...consumed.value.exchange,
    state: 'invalid'
  }
  await saveExchange(terminated)

  // The endpoint acknowledges receipt; it does not report an error of its own,
  // and it must not answer a conformant message with `invalid_request`. No
  // `redirect_uri` is returned: that URL is where a *completed* exchange sends
  // the user, and this exchange did not complete.
  return {
    ok: true,
    status: 200,
    outcome: 'wallet-error',
    exchange: terminated,
    response: {},
    walletError: report
  }
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
  // 0. An OID4VP error response is a DIFFERENT MESSAGE, not a presentation
  //    response in the wrong shape, and it is recognised by its own required
  //    `error` member with no `vp_token` present — never by sniffing a
  //    payload's shape. Checked against the raw body, before `coerceBody`,
  //    which rewrites the body into presentation-response fields and would
  //    drop `error` on the way.
  const walletError = walletErrorResponseSchema.safeParse(body)
  if (walletError.success) {
    return acceptWalletError(walletError.data, exchange)
  }

  // 1. Parse + validate the direct_post body, in the language THIS EXCHANGE
  //    ASKED IN. The exchange already knows — we do not sniff the payload
  //    shape. Sniffing would turn a wallet's malformed response into a
  //    silent fallback down the other code path, which is exactly the kind
  //    of accommodation that hides a defect this service exists to reveal.
  //    A response in the wrong shape is a failure, not a shape to rescue.
  const language = resolveQueryLanguage(exchange)
  const coerced = coerceBody(body)

  const parsed =
    language === 'pex'
      ? directPostPexResponseSchema.safeParse(coerced)
      : directPostResponseSchema.safeParse(coerced)
  if (!parsed.success) {
    return rejectRequest(
      exchange,
      'malformed-direct-post-body',
      language === 'pex'
        ? 'Malformed direct_post response: expected a `vp_token` with a `presentation_submission` (this exchange asked in Presentation Exchange).'
        : 'Malformed direct_post response: expected a DCQL `vp_token` object (this exchange asked in DCQL).'
    )
  }

  // 2. State / single-use replay guard.
  const consumed = consumeOid4vpResponse(exchange, parsed.data.state)
  if (!consumed.ok) {
    return rejectRequest(
      exchange,
      consumed.cause,
      consumed.reason,
      'presentation'
    )
  }
  const working = consumed.value.exchange

  // 3. Extract the presentation, per language.
  let vp: unknown
  if (language === 'pex') {
    // PEX: `vp_token` is the presentation (or an array of them); the
    // submission's descriptor_map[0].path locates it.
    const data = parsed.data as DirectPostPexResponse
    const entry = data.presentation_submission.descriptor_map[0]!
    const located = resolveJsonPath(data.vp_token, entry.path)
    if (located === undefined) {
      return rejectPresentation(
        working,
        'presentation-path-unresolved',
        `presentation_submission descriptor_map path could not be resolved: ${entry.path}`
      )
    }
    vp = Array.isArray(located) ? located[0] : located
  } else {
    // DCQL: `vp_token` is an object keyed by credential-query id. For this
    // binding exactly one query is issued; take the first entry's first
    // presentation.
    const data = parsed.data as DirectPostResponse
    vp = Object.values(data.vp_token)[0]?.[0]
  }
  if (!vp || typeof vp !== 'object') {
    return rejectPresentation(
      working,
      'no-presentation-in-vp-token',
      'vp_token contained no presentation.'
    )
  }
  const presentation = vp as Record<string, unknown>

  // 4. Audience binding: the VP proof MUST commit to our client_id as its
  //    `domain` (verifier-core does not enforce this; we must).
  if (!bindsAudience(presentation, clientIdForExchange(working))) {
    return rejectPresentation(
      working,
      'audience-binding-failed',
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
      outcome: 'presentation',
      exchange: working,
      response: redirectUrl ? { redirect_uri: redirectUrl } : {}
    }
  } catch (e) {
    // preparePresentationForVerify throws HTTPException(400) on structural
    // problems; surface those as an OID4VP error rather than leaking the
    // VC-API HTTPException JSON shape.
    if (e instanceof HTTPException && e.status === 400) {
      return rejectPresentation(
        working,
        'presentation-verification-failed',
        e.message
      )
    }
    throw e
  }
}
