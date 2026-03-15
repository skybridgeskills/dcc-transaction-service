import type {
  ExchangeClient,
  ExchangeStatusResponse
} from './exchange-client'

export class HttpExchangeClient implements ExchangeClient {
  async fetchProtocols(exchangeId: string): Promise<Record<string, string>> {
    const res = await fetch(`/interactions/${exchangeId}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const protoMap: Record<string, string> = {}
    for (const [k, v] of Object.entries(data.protocols)) {
      if (typeof v === 'string') protoMap[k] = v
    }
    return protoMap
  }

  async fetchExchangeStatus(vcapiUrl: string): Promise<ExchangeStatusResponse> {
    const res = await fetch(vcapiUrl, {
      credentials: 'include',
      headers: { Accept: 'application/json' }
    })
    if (!res.ok) throw new Error(`Status ${res.status}`)
    return res.json()
  }
}
