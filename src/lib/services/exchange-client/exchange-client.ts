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

export interface ExchangeStatusResponse {
  state: ExchangeState
  [key: string]: unknown
}

export interface ExchangeProtocols {
  iu: string
  vcapi: string
  [key: string]: unknown
}

export interface ExchangeClient {
  createExchange(
    workflowId: string,
    variables: Record<string, unknown>
  ): Promise<ExchangeProtocols>
  fetchProtocols(exchangeId: string): Promise<Record<string, string>>
  fetchExchangeStatus(vcapiUrl: string): Promise<ExchangeStatusResponse>
}
