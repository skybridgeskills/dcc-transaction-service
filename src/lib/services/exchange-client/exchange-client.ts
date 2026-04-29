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

export interface ExchangeClient {
  createExchange(
    workflowId: string,
    variables: Record<string, unknown>
  ): Promise<ExchangeProtocols>
  fetchProtocols(exchangeId: string): Promise<Record<string, string>>
  fetchExchangeStatus(vcapiUrl: string): Promise<ExchangeStatusResponse>
}
