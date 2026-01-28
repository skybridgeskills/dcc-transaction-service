import { HTTPException } from 'hono/http-exception'
import { getApp } from '../app/app-context.js'
import {
  createExchangeClaim,
  participateInClaimExchange,
  validateExchangeClaim
} from '../../workflows/claimWorkflow.js'
import {
  createExchangeDidAuth,
  getDIDAuthVPR,
  participateInDidAuthExchange
} from '../../workflows/didAuthWorkflow.js'
import {
  createExchangeVerify,
  getVerifyVPR,
  participateInVerifyExchange,
  validateExchangeVerify
} from '../../workflows/verifyWorkflow.js'
import { getLcwProtocol } from '../../protocols/lcw.js'

/**
 * ExchangeService interface for managing exchanges
 */

export interface ExchangeService {
  /**
   * Retrieves an exchange by exchangeId only, without workflowId validation.
   * Used for endpoints like /interactions/:exchangeId where workflowId is not known upfront.
   * @throws {Error} Exchange not found
   * @returns Exchange data if exchangeId exists
   */
  getExchangeById(exchangeId: string): Promise<App.ExchangeDetailBase>

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
   * Saves an exchange to storage
   * @param data The exchange data to save
   * @returns Success boolean
   */
  saveExchange(data: App.ExchangeDetailBase): Promise<boolean>

  /**
   * Clears all exchanges (for testing)
   */
  clearExchanges(): Promise<void>

  /**
   * Creates a single exchange for VC-API endpoints
   * @param input Exchange creation input data
   * @param config App configuration
   * @param workflow Workflow definition
   * @returns Created exchange data
   */
  createExchange(
    input: App.ExchangeCreateInput,
    config: App.Config,
    workflow: App.Workflow
  ): Promise<App.ExchangeDetailBase>

  /**
   * Gets exchange protocols (VPR, deep links, etc.) for an exchange
   * @param exchange Exchange data
   * @returns Protocol objects with iu, vcapi, lcw, and verifiablePresentationRequest
   */
  getExchangeProtocols(exchange: App.ExchangeDetailBase): {
    iu: string
    vcapi: string
    lcw?: string
    verifiablePresentationRequest: any
  }

  /**
   * Participates in an exchange (handles VPR request and participation response)
   * @param data Participation data (may be empty for VPR request)
   * @param exchange Exchange data
   * @param workflow Workflow definition
   * @param config App configuration
   * @returns Participation result
   */
  participateInExchange(
    data: any,
    exchange: App.ExchangeDetailBase,
    workflow: App.Workflow,
    config: App.Config
  ): Promise<any>

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

export class RealExchangeService implements ExchangeService {
  async getExchangeById(exchangeId: string): Promise<App.ExchangeDetailBase> {
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }
    const storedData = await app.keyValueStore.get(exchangeId)
    if (!storedData) {
      throw new HTTPException(404, { message: 'Exchange not found' })
    }
    return storedData
  }

  async getExchangeData(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }
    const storedData = await app.keyValueStore.get(exchangeId)
    if (!storedData || storedData.workflowId !== workflowId) {
      throw new HTTPException(404, { message: 'Exchange not found' })
    }
    return storedData
  }

  async saveExchange(data: App.ExchangeDetailBase): Promise<boolean> {
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }
    const ttl = new Date(data.expires).getTime() - Date.now() + 1000
    const success = await app.keyValueStore.set(data.exchangeId, data, ttl)
    if (!success) {
      throw new HTTPException(500, { message: 'Failed to save exchange.' })
    }
    return success
  }

  async clearExchanges(): Promise<void> {
    const app = getApp()
    if (app.keyValueStore) {
      await app.keyValueStore.clear()
    }
  }

  async createExchange(
    input: App.ExchangeCreateInput,
    config: App.Config,
    workflow: App.Workflow
  ): Promise<App.ExchangeDetailBase> {
    let exchange: App.ExchangeDetailBase
    let validated

    switch (workflow.id) {
      case 'claim':
        validated = validateExchangeClaim(input)
        exchange = await createExchangeClaim({
          data: validated,
          config
        })
        break
      case 'didAuth':
        exchange = await createExchangeDidAuth({
          data: input,
          config,
          workflow
        })
        break
      case 'verify':
        validated = validateExchangeVerify(input)
        exchange = await createExchangeVerify({
          data: validated,
          config,
          workflow
        })
        break
      case 'healthz':
        throw new HTTPException(400, {
          message: 'Workflow healthz is not valid for this endpoint'
        })
    }

    await this.saveExchange(exchange)
    return exchange
  }

  getExchangeProtocols(exchange: App.ExchangeDetailBase): {
    iu: string
    vcapi: string
    lcw?: string
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
    const protocols = {
      iu: interactionsUrl,
      vcapi: serviceEndpoint,
      lcw: getLcwProtocol(exchange),
      verifiablePresentationRequest
      // TODO: add "OID4VCI" support (claim workflow)
      // TODO: add "OID4VP" support for forthcoming verification workflows
    }
    return protocols
  }

  async participateInExchange(
    data: any,
    exchange: App.ExchangeDetailBase,
    workflow: App.Workflow,
    config: App.Config
  ): Promise<any> {
    if (!data || !Object.keys(data).length) {
      // If there is no body, this is the initial step of the exchange.
      return this.participateWithEmptyBody({ config, workflow, exchange })
    }
    if (workflow.id === 'didAuth') {
      return participateInDidAuthExchange({
        data,
        exchange: exchange as App.ExchangeDetailDidAuth,
        workflow,
        config
      })
    }
    // TODO: add "OID4VCI" support (claim workflow)
    if (workflow.id === 'claim') {
      return participateInClaimExchange({
        data,
        exchange: exchange as App.ExchangeDetailClaim,
        workflow,
        config
      })
    }
    if (workflow.id === 'verify') {
      return participateInVerifyExchange({
        data,
        exchange: exchange as App.ExchangeDetailVerify,
        workflow,
        config
      })
    }
  }

  async getExchangeState(
    exchangeId: string,
    workflowId: string
  ): Promise<App.ExchangeDetailBase> {
    return this.getExchangeData(exchangeId, workflowId)
  }

  private async participateWithEmptyBody({
    config,
    workflow,
    exchange
  }: {
    config: App.Config
    workflow: App.Workflow
    exchange: App.ExchangeDetailBase
  }) {
    if (['claim', 'didAuth'].includes(workflow.id)) {
      // Reply with a VPR to authenticate the wallet.
      const vpr = await getDIDAuthVPR(exchange)
      return { verifiablePresentationRequest: vpr }
    }
    if (workflow.id === 'verify') {
      const vpr = await getVerifyVPR(exchange as App.ExchangeDetailVerify)
      return { verifiablePresentationRequest: vpr }
    }

    // healthz/catchall
    throw new HTTPException(400, {
      message: 'Workflow is not valid for this endpoint'
    })
  }
}
