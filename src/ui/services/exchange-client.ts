export type ExchangeState = 'pending' | 'active' | 'complete' | 'invalid'

export interface ExchangeStatusResponse {
  state: ExchangeState
  [key: string]: unknown
}

export interface ExchangeClient {
  fetchProtocols(exchangeId: string): Promise<Record<string, string>>
  fetchExchangeStatus(vcapiUrl: string): Promise<ExchangeStatusResponse>
}
