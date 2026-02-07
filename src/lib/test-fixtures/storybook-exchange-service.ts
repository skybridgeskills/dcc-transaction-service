/**
 * Minimal ExchangeService implementation for Storybook
 * Implements getExchangeState(), getExchangeData(), and getExchangeProtocols()
 * Frontend-safe: No backend dependencies, uses in-memory Map storage
 */

import type { ExchangeService } from '../services/exchange-service.js'
import type { OID4VCI } from '../protocols/oid4vci/types.js'
import { getDIDAuthVPR, getVerifyVPR } from '../protocols/vpr-generation.js'
import { getLcwProtocol } from '../../protocols/lcw.js'
import {
  generateCredentialOfferUrl,
  generateDeepLinkUrl
} from '../protocols/oid4vci/url-utils.js'

/**
 * Lightweight ExchangeService for Storybook stories
 * Implements getExchangeState() for ExchangeStatusPoll component
 * and getExchangeData()/getExchangeProtocols() for WalletSelector component
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
   * Used by ExchangeStatusPoll component
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

  getExchangeProtocols(exchange: App.ExchangeDetailBase): {
    iu: string
    vcapi: string
    lcw?: string
    OID4VCI?: string
    verifiablePresentationRequest: any
  } {
    const verifiablePresentationRequest =
      exchange.workflowId === 'verify'
        ? getVerifyVPR(exchange as App.ExchangeDetailVerify)
        : getDIDAuthVPR(exchange)
    const serviceEndpoint =
      verifiablePresentationRequest.interact.service[0].serviceEndpoint ?? ''
    // Use the canonical interactions endpoint per VCALM spec
    const interactionsUrl = `${exchange.variables.exchangeHost}/interactions/${exchange.exchangeId}?iuv=1`
    const protocols: {
      iu: string
      vcapi: string
      lcw?: string
      OID4VCI?: string
      verifiablePresentationRequest: any
    } = {
      iu: interactionsUrl,
      vcapi: serviceEndpoint,
      lcw: getLcwProtocol(exchange),
      verifiablePresentationRequest
    }

    // Add OID4VCI protocol for claim exchanges
    if (exchange.workflowId === 'claim') {
      const credentialOfferUrl = generateCredentialOfferUrl(
        exchange.variables.exchangeHost,
        exchange.workflowId,
        exchange.exchangeId
      )
      protocols.OID4VCI = generateDeepLinkUrl(credentialOfferUrl)
    }

    return protocols
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
