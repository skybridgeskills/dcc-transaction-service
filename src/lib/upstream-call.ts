/**
 * Calls another service the way this one has to call it: with the failure
 * preserved.
 *
 * ## The incident
 *
 * `callService` (`utils.ts`) is a bare `axios.post` with no error handling, so
 * an upstream refusal that carried a precise diagnosis arrived at the caller as
 * an opaque `AxiosError` and left as `{"code":500,"message":"An unexpected
 * error occurred"}`.
 *
 * The motivating case: allocating a status-list index for a credential id that
 * already has one is a **409 with problem details** from the status service.
 * That refusal is correct — one credential id gets one revocation index, and
 * that is what a status list *means* — and it is precisely stated. We threw it
 * away and rendered a generic 500, and the 500 was then read as a status-list
 * bug for weeks. It never was one.
 *
 * ## What this does, and the line it does not cross
 *
 * Two separate things, deliberately kept apart:
 *
 * 1. **The journal gets everything** — upstream status, body, problem details,
 *    verbatim. Agent-facing, durable, and the only copy that outlives the
 *    exchange record's ten-minute eviction.
 * 2. **The response gets the upstream's own refusal, and only when the
 *    upstream stated one.** Forwarding a 409-with-problem-details is a fix to
 *    *our own* error handling — we already had a precise answer and were
 *    discarding it. It is not an accommodation of anybody, and nothing else
 *    about what a caller sees changes: an upstream failure that said nothing
 *    structured still surfaces exactly as it does today.
 *
 * `handleErrors` (`hono.ts`) already forwards `err.cause.problemDetails` onto
 * the response when present, so preserving the cause is all that is required
 * for a 409 with problem details to reach the caller as a 409 with problem
 * details.
 */
import axios from 'axios'
import { HTTPException } from 'hono/http-exception'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { callService } from '../utils.js'
import { journalExchangeEvent } from '../journal/index.js'

/**
 * Which upstream call this was. A closed set so a later reader of the journal
 * can group by it without having read every writer; extend it when a third
 * upstream call appears.
 */
export type UpstreamCallStage =
  | 'status-allocate'
  | 'credential-signing'
  | 'request-object-signing'

/**
 * Statuses that are about *us*, not about the caller's request.
 *
 * An upstream 401/403 means this service's own credentials with that service
 * are wrong — a deployment fault. Forwarding it would tell the caller they are
 * unauthorized, which is false and actively misleading. It stays a 500, and
 * the journal carries the real cause.
 */
const OUR_FAULT_STATUSES = new Set([401, 403])

/** What we managed to learn about an upstream failure. */
type UpstreamFailure = {
  status?: number
  statusText?: string
  /** Axios transport code (`ECONNREFUSED`, `ETIMEDOUT`) when there was no response. */
  code?: string
  message: string
  /** The upstream response body, verbatim, whatever shape it came in. */
  body?: unknown
  /** RFC 9457-shaped details, when the upstream sent them in this service's own envelope. */
  problemDetails?: App.ProblemDetail[]
}

const describeFailure = (error: unknown): UpstreamFailure => {
  if (!axios.isAxiosError(error)) {
    return { message: error instanceof Error ? error.message : String(error) }
  }
  const data = error.response?.data as
    | { message?: unknown; problemDetails?: unknown }
    | undefined
  const problemDetails = Array.isArray(data?.problemDetails)
    ? (data.problemDetails as App.ProblemDetail[])
    : undefined
  return {
    ...(error.response ? { status: error.response.status } : {}),
    ...(error.response?.statusText
      ? { statusText: error.response.statusText }
      : {}),
    ...(error.code ? { code: error.code } : {}),
    message: error.message,
    ...(error.response ? { body: error.response.data } : {}),
    ...(problemDetails ? { problemDetails } : {})
  }
}

/**
 * The error to throw on, given what the upstream said.
 *
 * Returns `undefined` when the failure should keep travelling as itself —
 * today's behaviour, a generic 500 — because the upstream stated nothing a
 * caller could act on and inventing a status for it would be a worse lie than
 * the 500.
 */
const forwardableException = (
  failure: UpstreamFailure
): HTTPException | undefined => {
  const { status, problemDetails } = failure
  if (!status || !problemDetails) return undefined
  if (status < 400 || status >= 500) return undefined
  if (OUR_FAULT_STATUSES.has(status)) return undefined

  const upstreamMessage = (failure.body as { message?: unknown } | undefined)
    ?.message
  return new HTTPException(status as ContentfulStatusCode, {
    message:
      typeof upstreamMessage === 'string' && upstreamMessage
        ? upstreamMessage
        : failure.message,
    // `handleErrors` reads exactly this shape off `err.cause`.
    cause: { problemDetails }
  })
}

/**
 * POST to another service, journalling the cause of any failure against the
 * exchange it was made for.
 *
 * @throws the upstream's own status when it refused with problem details;
 * otherwise the original error, unchanged.
 */
export const callUpstreamService = async <T>({
  exchange,
  stage,
  endpoint,
  body,
  headers
}: {
  exchange: Pick<
    App.ExchangeDetailBase,
    'exchangeId' | 'workflowId' | 'tenantName'
  >
  stage: UpstreamCallStage
  endpoint: string
  body: Record<string, unknown>
  headers?: Record<string, string>
}): Promise<T> => {
  try {
    return (await callService(endpoint, body, headers)) as T
  } catch (error) {
    const failure = describeFailure(error)
    // Verbatim, including the body. The journal's redactor strips bearer
    // tokens centrally, so nothing has to be withheld here to be safe — and
    // withholding the upstream's own words is how the 409 became a 500 in the
    // first place.
    journalExchangeEvent(exchange, 'error', { stage, endpoint, ...failure })
    throw forwardableException(failure) ?? error
  }
}
