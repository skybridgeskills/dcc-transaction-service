import type {
  ExchangeClient,
  ExchangeProtocols,
  ExchangeState,
  ExchangeStatusResponse
} from './exchange-client'

export interface FakeExchangeClientOptions {
  protocols: Record<string, string>
  /** A single state or a sequence that advances on each fetchExchangeStatus call. */
  states: ExchangeState | ExchangeState[]
}

export class FakeExchangeClient implements ExchangeClient {
  private readonly protocols: Record<string, string>
  private readonly states: ExchangeState[]
  private callIndex = 0

  constructor(options: FakeExchangeClientOptions) {
    this.protocols = options.protocols
    this.states = Array.isArray(options.states)
      ? options.states
      : [options.states]
  }

  async createExchange(
    _workflowId: string,
    _variables: Record<string, unknown>
  ): Promise<ExchangeProtocols> {
    return {
      iu: this.protocols['iu'] ?? '',
      vcapi: this.protocols['vcapi'] ?? '',
      ...this.protocols
    }
  }

  async fetchProtocols(_exchangeId: string): Promise<Record<string, string>> {
    return this.protocols
  }

  async fetchExchangeStatus(_vcapiUrl: string): Promise<ExchangeStatusResponse> {
    const idx = Math.min(this.callIndex, this.states.length - 1)
    const state = this.states[idx]
    this.callIndex++
    return { state }
  }
}
