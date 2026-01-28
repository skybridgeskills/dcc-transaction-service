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
import { generateCredentialOffer } from '../protocols/oid4vci/credential-offer.js'
import { processAuthorization } from '../protocols/oid4vci/authorization.js'
import {
  generateTokenForPreAuthorizedCode,
  generateTokenForAuthorizationCode
} from '../protocols/oid4vci/token.js'
import {
  validateAccessToken,
  formatCredentialResponse
} from '../protocols/oid4vci/credential.js'
import {
  generateCredentialOfferUrl,
  generateDeepLinkUrl,
  calculateTokenExpiration,
  generatePreAuthorizedCode
} from '../protocols/oid4vci/utils.js'
import type { OID4VCI } from '../protocols/oid4vci/types.js'
import { getWorkflow } from '../../workflows.js'

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
   * @returns Protocol objects with iu, vcapi, lcw, OID4VCI, and verifiablePresentationRequest
   */
  getExchangeProtocols(exchange: App.ExchangeDetailBase): {
    iu: string
    vcapi: string
    lcw?: string
    OID4VCI?: string
    verifiablePresentationRequest: any
  }

  /**
   * Gets OID4VCI credential offer for a claim exchange
   * @param exchange The claim exchange
   * @param config App configuration
   * @returns Credential offer object
   */
  getOid4vciCredentialOffer(
    exchange: App.ExchangeDetailBase,
    config: App.Config
  ): Promise<OID4VCI.CredentialOffer>

  /**
   * Processes OID4VCI authorization request with pre-authorized code
   * @param exchangeId The exchange ID
   * @param preAuthorizedCode The pre-authorized code
   * @returns Authorization response with authorization code
   */
  getOid4vciAuthorization(
    exchangeId: string,
    preAuthorizedCode: string
  ): Promise<OID4VCI.AuthorizationResponse>

  /**
   * Gets OID4VCI token for authorization code or pre-authorized code grant
   * @param exchangeId The exchange ID
   * @param grantType The grant type ('authorization_code' or 'urn:ietf:params:oauth:grant-type:pre-authorized_code')
   * @param code Optional authorization code (for authorization_code grant)
   * @param preAuthorizedCode Optional pre-authorized code (for pre-authorized_code grant)
   * @returns Token response with access token and c_nonce
   */
  getOid4vciToken(
    exchangeId: string,
    grantType: string,
    code?: string,
    preAuthorizedCode?: string
  ): Promise<OID4VCI.TokenResponse>

  /**
   * Gets OID4VCI credential using access token
   * @param exchangeId The exchange ID
   * @param accessToken The access token
   * @param credentialRequest The credential request
   * @param config App configuration
   * @returns Credential response with credential
   */
  getOid4vciCredential(
    exchangeId: string,
    accessToken: string,
    credentialRequest: OID4VCI.CredentialRequest,
    config: App.Config
  ): Promise<OID4VCI.CredentialResponse>

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

  async getOid4vciCredentialOffer(
    exchange: App.ExchangeDetailBase,
    config: App.Config
  ): Promise<OID4VCI.CredentialOffer> {
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI is only supported for claim exchanges'
      })
    }

    const workflow = getWorkflow('claim')
    const claimExchange = exchange as App.ExchangeDetailClaim

    // Get or generate pre-authorized code
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }

    const codeKey = `oid4vci:code:${exchange.exchangeId}`
    let storedCode = await app.keyValueStore.get<OID4VCI.StoredCode>(codeKey)

    let preAuthorizedCode: string
    if (
      storedCode &&
      !storedCode.used &&
      new Date(storedCode.expiresAt) > new Date()
    ) {
      preAuthorizedCode = storedCode.code
    } else {
      // Generate new pre-authorized code
      preAuthorizedCode = generatePreAuthorizedCode()
      const expiresAt = calculateTokenExpiration(600) // 10 minutes
      storedCode = {
        code: preAuthorizedCode,
        expiresAt,
        used: false
      }
      const ttl = new Date(expiresAt).getTime() - Date.now()
      await app.keyValueStore.set(codeKey, storedCode, ttl)
    }

    return generateCredentialOffer(
      claimExchange,
      config,
      workflow,
      preAuthorizedCode
    )
  }

  async getOid4vciAuthorization(
    exchangeId: string,
    preAuthorizedCode: string
  ): Promise<OID4VCI.AuthorizationResponse> {
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }

    // Get exchange to validate it's a claim exchange
    const exchange = await this.getExchangeById(exchangeId)
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI is only supported for claim exchanges'
      })
    }

    // Get stored pre-authorized code
    const codeKey = `oid4vci:code:${exchangeId}`
    const storedCode = await app.keyValueStore.get<OID4VCI.StoredCode>(codeKey)

    // Process authorization
    const authResponse = processAuthorization(preAuthorizedCode, storedCode)

    // Store authorization code
    if (authResponse.code) {
      const authCodeKey = `oid4vci:authcode:${exchangeId}`
      const authCodeData: OID4VCI.StoredCode = {
        code: authResponse.code,
        expiresAt: calculateTokenExpiration(600), // 10 minutes
        used: false
      }
      const ttl = new Date(authCodeData.expiresAt).getTime() - Date.now()
      await app.keyValueStore.set(authCodeKey, authCodeData, ttl)

      // Mark pre-authorized code as used
      if (storedCode) {
        storedCode.used = true
        await app.keyValueStore.set(codeKey, storedCode)
      }
    }

    return authResponse
  }

  async getOid4vciToken(
    exchangeId: string,
    grantType: string,
    code?: string,
    preAuthorizedCode?: string
  ): Promise<OID4VCI.TokenResponse> {
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }

    // Get exchange to validate it's a claim exchange
    const exchange = await this.getExchangeById(exchangeId)
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI is only supported for claim exchanges'
      })
    }

    let tokenResponse: OID4VCI.TokenResponse

    if (grantType === 'urn:ietf:params:oauth:grant-type:pre-authorized_code') {
      if (!preAuthorizedCode) {
        throw new HTTPException(400, {
          message:
            'pre-authorized_code is required for pre-authorized_code grant'
        })
      }

      const codeKey = `oid4vci:code:${exchangeId}`
      const storedCode =
        await app.keyValueStore.get<OID4VCI.StoredCode>(codeKey)
      tokenResponse = generateTokenForPreAuthorizedCode(
        preAuthorizedCode,
        storedCode
      )

      // Mark pre-authorized code as used
      if (storedCode) {
        storedCode.used = true
        await app.keyValueStore.set(codeKey, storedCode)
      }
    } else if (grantType === 'authorization_code') {
      if (!code) {
        throw new HTTPException(400, {
          message: 'code is required for authorization_code grant'
        })
      }

      const authCodeKey = `oid4vci:authcode:${exchangeId}`
      const storedCode =
        await app.keyValueStore.get<OID4VCI.StoredCode>(authCodeKey)
      tokenResponse = generateTokenForAuthorizationCode(code, storedCode)

      // Mark authorization code as used
      if (storedCode) {
        storedCode.used = true
        await app.keyValueStore.set(authCodeKey, storedCode)
      }
    } else {
      throw new HTTPException(400, {
        message: `Unsupported grant_type: ${grantType}`
      })
    }

    // Store access token
    const tokenKey = `oid4vci:token:${exchangeId}`
    const tokenData: OID4VCI.StoredToken = {
      exchangeId,
      accessToken: tokenResponse.access_token,
      expiresAt: calculateTokenExpiration(tokenResponse.expires_in || 3600),
      cNonce: tokenResponse.c_nonce,
      cNonceExpiresAt: tokenResponse.c_nonce
        ? calculateTokenExpiration(tokenResponse.c_nonce_expires_in || 300)
        : undefined
    }
    const ttl = new Date(tokenData.expiresAt).getTime() - Date.now()
    await app.keyValueStore.set(tokenKey, tokenData, ttl)

    return tokenResponse
  }

  async getOid4vciCredential(
    exchangeId: string,
    accessToken: string,
    credentialRequest: OID4VCI.CredentialRequest,
    config: App.Config
  ): Promise<OID4VCI.CredentialResponse> {
    const app = getApp()
    if (!app.keyValueStore) {
      throw new HTTPException(500, {
        message: 'KeyValueStore not available in app context'
      })
    }

    // Get exchange and validate it's a claim exchange
    const exchange = await this.getExchangeById(exchangeId)
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI is only supported for claim exchanges'
      })
    }

    // Validate access token
    const tokenKey = `oid4vci:token:${exchangeId}`
    const storedToken =
      await app.keyValueStore.get<OID4VCI.StoredToken>(tokenKey)
    validateAccessToken(accessToken, storedToken, exchangeId)

    // Get workflow
    const workflow = getWorkflow('claim')
    const claimExchange = exchange as App.ExchangeDetailClaim

    // Convert OID4VCI credential request to VC-API format
    // For now, we'll use an empty presentation since DID Auth was already done via token
    // The credential request format may include proof of possession, but we'll handle that later
    const vcApiData = credentialRequest.proof?.jwt
      ? { proof: { jwt: credentialRequest.proof.jwt } }
      : {}

    // Call participateInClaimExchange to issue credential
    const vcApiResponse = await participateInClaimExchange({
      data: vcApiData,
      exchange: claimExchange,
      workflow,
      config
    })

    // Format response to OID4VCI format
    return formatCredentialResponse(vcApiResponse)
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
