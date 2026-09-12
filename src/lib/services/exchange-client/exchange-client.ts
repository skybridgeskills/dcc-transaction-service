export type ExchangeState = 'pending' | 'active' | 'complete' | 'invalid'

/** Thrown when an HTTP request returns a non-2xx status. */
export class HttpNotOkResponseError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'HttpNotOkResponseError'
    Object.setPrototypeOf(this, HttpNotOkResponseError.prototype)
  }
}

/** `variables` slice returned on VC-API exchange GET (used by the interaction UI). */
export interface ExchangeStatusVariables {
  results?: Record<string, unknown>
  features?: Record<string, string | boolean>
  [key: string]: unknown
}

export interface ExchangeStatusResponse {
  state: ExchangeState
  workflowId?: string
  variables?: ExchangeStatusVariables
  [key: string]: unknown
}

export interface ExchangeProtocols {
  iu: string
  vcapi: string
  [key: string]: unknown
}

/**
 * One launch preset, exactly as `GET /interactions/:id/presets` serves it.
 *
 * ⚠️ **Facts, not display strings.** Base labels and the words for an axis are
 * copy and live in the UI; this is what the server can vouch for. See
 * `protocol-profiles/offerable.ts`.
 */
export interface LaunchPreset {
  id: string
  payloadId: string
  protocolProfileName: string | null
  isDefault: boolean
  axes: Array<{ field: string; value: string }>
  productIds: string[]
  payload: string
}

export interface ExchangeClient {
  createExchange(
    workflowId: string,
    variables: Record<string, unknown>
  ): Promise<ExchangeProtocols>
  fetchProtocols(exchangeId: string): Promise<Record<string, string>>
  fetchExchangeStatus(vcapiUrl: string): Promise<ExchangeStatusResponse>
  /**
   * Report which payload the page is displaying, so the journal records the
   * interaction method rather than the operator's memory of it.
   *
   * Never rejects. This is an observation about an exchange, not a step in one:
   * a scan must not fail because the record of it could not be written.
   */
  recordInteractionMethod(
    exchangeId: string,
    payloadId: string,
    payload: string
  ): Promise<void>
  /**
   * The launch presets this exchange may be offered under.
   *
   * ⚠️ **Unlike {@link ExchangeClient.recordInteractionMethod}, this one MAY
   * reject.** An interaction method report is an observation whose loss costs a
   * line of evidence; a page with no presets has nothing to show, so the
   * failure has to reach the UI rather than leaving an operator looking at an
   * empty list wondering whether that is the answer.
   */
  fetchPresets(exchangeId: string): Promise<LaunchPreset[]>
}
