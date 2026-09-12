/**
 * The journal's boundary around VC-API participation.
 *
 * ## The gap this closes
 *
 * `preparePresentationForVerify` ends the request with `throw
 * HTTPException(400)` at three sites — invalid VP, missing holder, invalid
 * credentials. On the VC-API arm those throws travelled straight out to
 * `handleErrors`, which renders JSON and returns. **Nothing was written down.**
 * `saveExchange` is what journals `terminal`, and a request that throws never
 * reaches it, so an exchange where a wallet submitted a presentation and *we*
 * turned it down left a journal containing `mint` and nothing else.
 *
 * That is not a missing nicety. When a presentation is rejected here with
 * `400 Invalid Verifiable Credential(s)`, the only surviving account of the
 * exchange is whatever the client itself logged — which inverts the evidence
 * model, and for a wire-only client, which has no local log to offer, leaves
 * no record at all.
 *
 * ## Why a boundary and not three call sites
 *
 * This is the third journal gap of the same family, and the previous two were
 * closed structurally rather than by patching the sites that happened to be
 * known. Journalling at each `throw` would fix exactly today's three and would
 * be silently incomplete the day a fourth is added — which is how the first
 * three got here.
 *
 * So the rule is enforced where the request ends rather than where it fails:
 * **a submission is journalled on arrival, and whatever ends it is journalled
 * too.** A `submission` line with no following `error` or `terminal` line is
 * then a visible defect in this service rather than an invisible one.
 *
 * The OID4VP arm reaches the same pipeline through `handleOid4vpResponse`,
 * which already journals its own rejections (`rejectPresentation` /
 * `rejectRequest`) with mirrored fields. This wrapper is deliberately **not**
 * applied there: doubling the lines would make a single rejection read as two.
 */
import { HTTPException } from 'hono/http-exception'
import { participateInExchange } from '../exchanges.js'
import { journalExchangeEvent } from '../journal/index.js'

/** The protocol arm a submission arrived on. */
export type SubmissionArm = 'vc-api'

/**
 * Run `participateInExchange`, bracketed by journal lines.
 *
 * Returns and throws exactly what `participateInExchange` does — the wire
 * behaviour is unchanged, and deliberately so. Every difference is in the
 * record.
 */
export const participateAndJournal = async ({
  data,
  config,
  workflow,
  exchange,
  arm,
  attribution
}: {
  data: Record<string, unknown> | null | undefined
  config: App.Config
  workflow: App.Workflow
  exchange: App.ExchangeDetailBase
  arm: SubmissionArm
  attribution: Record<string, string>
}) => {
  // `hasBody` distinguishes the two things this route does. An empty body is
  // the initial step of an exchange (the wallet asking what we want), not a
  // presentation; recording both as `submission` would make the count of
  // submissions useless, which is the field a reader reaches for first.
  const hasBody = !!data && Object.keys(data).length > 0

  if (hasBody) {
    journalExchangeEvent(exchange, 'submission', {
      arm,
      // Not the presentation itself. `terminal` already carries the verdict
      // and the compat log, and on the reject path the `error` line below
      // carries the problem details — a third copy of the same VP would
      // triple the file for nothing. What this line is FOR is the fact that a
      // submission arrived at all, and from whom.
      ...attribution
    })
  }

  try {
    return await participateInExchange({ data, config, workflow, exchange })
  } catch (error) {
    if (hasBody) journalRejection({ exchange, arm, error })
    throw error
  }
}

/**
 * Journal whatever ended the request.
 *
 * ⚠️ **Every error, not only `HTTPException`.** An unexpected throw becomes a
 * generic `500 An unexpected error occurred` in `handleErrors` — the response
 * body deliberately says nothing, so if the journal also says nothing the cause
 * exists only in stdout of a process that has since exited. That is the same
 * shape as the status-service 409 collapsing into a 500, which is the case the
 * `error` event was added for in the first place.
 */
const journalRejection = ({
  exchange,
  arm,
  error
}: {
  exchange: App.ExchangeDetailBase
  arm: SubmissionArm
  error: unknown
}): void => {
  if (error instanceof HTTPException) {
    // `problemDetails` is the whole point of journalling the rejection: the
    // wire code (400) says only that we refused, and the reason we refused is
    // what a later reader has to attribute. `handleErrors` reads this exact
    // shape off `err.cause` to build the response body, so what is journalled
    // is what the wallet was told, verbatim.
    const cause = error.cause as { problemDetails?: unknown } | undefined
    journalExchangeEvent(exchange, 'error', {
      stage: `${arm}-participate`,
      reason: 'participation-rejected',
      status: error.status,
      message: error.message,
      ...(cause && typeof cause === 'object' && Array.isArray(cause.problemDetails)
        ? { problemDetails: cause.problemDetails }
        : {})
    })
    return
  }

  // The redactor flattens `Error` instances to their own fields (and would
  // otherwise serialise them as `{}`), so handing it the error itself keeps the
  // message and the stack without this call site having to pick them apart.
  journalExchangeEvent(exchange, 'error', {
    stage: `${arm}-participate`,
    reason: 'participation-failed',
    status: 500,
    error
  })
}
