/**
 * Fake exchange client for testing and Storybook
 * Implements ExchangeClient interface with configurable in-memory data
 */

import type { ExchangeClient } from '../services/ui/exchange-client.js'

export interface FakeExchangeClientConfig {
  /**
   * Custom exchange data keyed by `${workflowId}:${exchangeId}`
   */
  exchanges?: Record<string, App.ExchangeDetailBase>
  /**
   * Default exchange to return if not found in exchanges map
   */
  defaultExchange?: App.ExchangeDetailBase
}

/**
 * Fake exchange client that implements ExchangeClient interface
 * Useful for testing and Storybook stories
 */
export class FakeExchangeClient implements ExchangeClient {
  private exchanges: Map<string, App.ExchangeDetailBase>
  private defaultExchange?: App.ExchangeDetailBase

  /**
   * Creates a new FakeExchangeClient
   * @param config Optional configuration for exchange data
   */
  constructor(config: FakeExchangeClientConfig = {}) {
    this.exchanges = new Map()
    this.defaultExchange = config.defaultExchange

    if (config.exchanges) {
      for (const [key, exchange] of Object.entries(config.exchanges)) {
        this.exchanges.set(key, exchange)
      }
    }
  }

  /**
   * Adds an exchange to the fake client
   * @param exchange Exchange data to add
   */
  addExchange(exchange: App.ExchangeDetailBase): void {
    const key = `${exchange.workflowId}:${exchange.exchangeId}`
    this.exchanges.set(key, exchange)
  }

  /**
   * Adds multiple exchanges to the fake client
   * @param exchanges Record of exchangeId -> exchange data
   */
  addExchanges(exchanges: Record<string, App.ExchangeDetailBase>): void {
    for (const exchange of Object.values(exchanges)) {
      this.addExchange(exchange)
    }
  }

  async getExchangeData(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    return this.getExchange(exchangeId, workflowId)
  }

  async getExchangeState(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    return this.getExchange(exchangeId, workflowId)
  }

  private getExchange(
    exchangeId: string,
    workflowId: string
  ): App.ExchangeDetailBase {
    const key = `${workflowId}:${exchangeId}`
    const exchange = this.exchanges.get(key)

    if (exchange) {
      return exchange
    }

    if (this.defaultExchange) {
      return this.defaultExchange
    }

    throw new Error(`Exchange not found: ${exchangeId} (workflow: ${workflowId})`)
  }
}

/**
 * Helper function to create a FakeExchangeClient with configuration
 * @param config Optional configuration for exchange data
 * @returns Configured FakeExchangeClient instance
 */
export function createFakeExchangeClient(
  config?: FakeExchangeClientConfig
): FakeExchangeClient {
  return new FakeExchangeClient(config)
}
