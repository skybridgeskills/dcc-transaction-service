export type ExchangeState = 'pending' | 'active' | 'complete' | 'invalid'

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
