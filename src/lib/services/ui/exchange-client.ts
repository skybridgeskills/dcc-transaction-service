/**
 * UI-side exchange client interface and implementation
 * Client-side HTTP client for fetching exchange data
 */

/**
 * Interface for UI-side exchange client
 * Provides methods to fetch exchange data via HTTP
 */
export interface ExchangeClient {
  /**
   * Retrieves exchange data if exchangeId exists and workflowId matches
   * @throws {Error} Exchange not found or workflowId mismatch
   * @returns Exchange data if exchangeId exists and workflowId matches
   */
  getExchangeData(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase>

  /**
   * Gets the current state of an exchange
   * @param exchangeId Exchange ID
   * @param workflowId Workflow ID
   * @returns Exchange data with current state
   */
  getExchangeState(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase>
}

/**
 * HTTP implementation of ExchangeClient
 * Fetches exchange data from the server via HTTP
 */
export class HttpExchangeClient implements ExchangeClient {
  private readonly baseUrl: string

  /**
   * Creates a new HttpExchangeClient
   * @param baseUrl Optional base URL for API requests (defaults to current origin)
   */
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '')
  }

  async getExchangeData(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    return this.fetchExchange(exchangeId, workflowId)
  }

  async getExchangeState(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    return this.fetchExchange(exchangeId, workflowId)
  }

  private async fetchExchange(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    const url = `${this.baseUrl}/workflows/${workflowId}/exchanges/${exchangeId}`
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        }
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Exchange not found')
        }
        if (response.status === 401) {
          throw new Error('Unauthorized')
        }
        throw new Error(`Failed to fetch exchange: ${response.status} ${response.statusText}`)
      }

      const exchange = await response.json() as App.ExchangeDetailBase

      // Validate workflowId matches
      if (exchange.workflowId !== workflowId) {
        throw new Error('Exchange not found')
      }

      return exchange
    } catch (error) {
      if (error instanceof Error) {
        throw error
      }
      throw new Error(`Network error: ${String(error)}`)
    }
  }
}
