import {
  type ExchangeClient,
  type ExchangeProtocols,
  type ExchangeStatusResponse,
  HttpNotOkResponseError
} from './exchange-client.js'

export class HttpExchangeClient implements ExchangeClient {
  private readonly baseUrl: string
  private readonly authToken: string | undefined

  constructor(baseUrl = '', authToken?: string) {
    this.baseUrl = baseUrl
    this.authToken = authToken
  }

  private buildHeaders(
    extra: Record<string, string> = {}
  ): Record<string, string> {
    const headers: Record<string, string> = { ...extra }
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`
    }
    return headers
  }

  private fetchOptions(headers: Record<string, string>): RequestInit {
    const opts: RequestInit = { headers }
    if (!this.authToken) {
      opts.credentials = 'include'
    }
    return opts
  }

  async createExchange(
    workflowId: string,
    variables: Record<string, unknown>
  ): Promise<ExchangeProtocols> {
    const url = `${this.baseUrl}/workflows/${workflowId}/exchanges`
    const headers = this.buildHeaders({ 'Content-Type': 'application/json' })
    const res = await fetch(url, {
      method: 'POST',
      ...this.fetchOptions(headers),
      body: JSON.stringify({ variables })
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`HTTP ${res.status}${text ? `: ${text}` : ''}`)
    }
    return res.json()
  }

  async fetchProtocols(exchangeId: string): Promise<Record<string, string>> {
    const url = `${this.baseUrl}/interactions/${exchangeId}`
    const headers = this.buildHeaders({ Accept: 'application/json' })
    const res = await fetch(url, this.fetchOptions(headers))
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const protoMap: Record<string, string> = {}
    for (const [k, v] of Object.entries(data.protocols)) {
      if (typeof v === 'string') protoMap[k] = v
    }
    return protoMap
  }

  async fetchExchangeStatus(vcapiUrl: string): Promise<ExchangeStatusResponse> {
    const headers = this.buildHeaders({ Accept: 'application/json' })
    const res = await fetch(vcapiUrl, this.fetchOptions(headers))
    if (!res.ok)
      throw new HttpNotOkResponseError(`Status ${res.status}`, res.status)
    return res.json()
  }
}
