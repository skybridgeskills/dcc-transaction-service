/**
 * Minimal ExchangeService implementation for Storybook
 * Only implements getExchangeState() - other methods throw "Not implemented"
 * Frontend-safe: No backend dependencies, uses in-memory Map storage
 */

import type { ExchangeService } from '../services/exchange-service.js'
import type { OID4VCI } from '../protocols/oid4vci/types.js'

/**
 * Lightweight ExchangeService for Storybook stories
 * Only implements getExchangeState() which is needed by ExchangeStatusPoll component
 */
export class StorybookExchangeService implements ExchangeService {
  private exchanges: Map<string, App.ExchangeDetailBase> = new Map()

  /**
   * Adds an exchange to the in-memory store
   * @param exchange Exchange data to store
   */
  addExchange(exchange: App.ExchangeDetailBase): void {
    this.exchanges.set(exchange.exchangeId, exchange)
  }

  /**
   * Adds multiple exchanges to the in-memory store
   * @param exchanges Record of exchangeId -> exchange data
   */
  addExchanges(exchanges: Record<string, App.ExchangeDetailBase>): void {
    for (const [exchangeId, exchange] of Object.entries(exchanges)) {
      this.exchanges.set(exchangeId, exchange)
    }
  }

  /**
   * Gets the current state of an exchange
   * This is the only method actually used by Storybook components
   */
  async getExchangeState(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    const exchange = this.exchanges.get(exchangeId)
    if (!exchange) {
      throw new Error(`Exchange not found: ${exchangeId}`)
    }
    if (exchange.workflowId !== workflowId) {
      throw new Error(
        `Workflow mismatch: expected ${workflowId}, got ${exchange.workflowId}`
      )
    }
    return exchange
  }

  // Unimplemented methods - throw errors since they're not used in Storybook

  async getExchangeById(_exchangeId: string): Promise<App.ExchangeDetailBase> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async getExchangeData(
    _exchangeId: string,
    _workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async saveExchange(_data: App.ExchangeDetailBase): Promise<boolean> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async clearExchanges(): Promise<void> {
    this.exchanges.clear()
  }

  async createExchange(
    _input: App.ExchangeCreateInput,
    _config: App.Config,
    _workflow: App.Workflow
  ): Promise<App.ExchangeDetailBase> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  getExchangeProtocols(_exchange: App.ExchangeDetailBase): {
    iu: string
    vcapi: string
    lcw?: string
    OID4VCI?: string
    verifiablePresentationRequest: any
  } {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async getOid4vciCredentialOffer(
    _exchange: App.ExchangeDetailBase,
    _config: App.Config
  ): Promise<OID4VCI.CredentialOffer> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async getOid4vciAuthorization(
    _exchangeId: string,
    _preAuthorizedCode: string
  ): Promise<OID4VCI.AuthorizationResponse> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async getOid4vciToken(
    _exchangeId: string,
    _grantType: string,
    _code?: string,
    _preAuthorizedCode?: string
  ): Promise<OID4VCI.TokenResponse> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async getOid4vciCredential(
    _exchangeId: string,
    _accessToken: string,
    _credentialRequest: OID4VCI.CredentialRequest,
    _config: App.Config
  ): Promise<OID4VCI.CredentialResponse> {
    throw new Error('Not implemented in StorybookExchangeService')
  }

  async participateInExchange(
    _data: any,
    _exchange: App.ExchangeDetailBase,
    _workflow: App.Workflow,
    _config: App.Config
  ): Promise<any> {
    throw new Error('Not implemented in StorybookExchangeService')
  }
}
