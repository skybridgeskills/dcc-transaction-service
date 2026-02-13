/**
 * Client-side exchange utilities
 * Frontend-safe functions for extracting protocols from exchange data
 */

import { getDIDAuthVPR, getVerifyVPR } from '../protocols/vpr-generation.js'
import { getLcwProtocol } from '../../protocols/lcw.js'
import {
  generateCredentialOfferUrl,
  generateDeepLinkUrl
} from '../protocols/oid4vci/url-utils.js'

export interface ExchangeProtocols {
  iu: string
  vcapi: string
  lcw?: string
  OID4VCI?: string
  verifiablePresentationRequest: any
}

/**
 * Gets exchange protocols (VPR, deep links, etc.) for an exchange
 * Client-side version that extracts protocols from exchange data without server dependencies
 * @param exchange Exchange data
 * @returns Protocol objects with iu, vcapi, lcw, OID4VCI, and verifiablePresentationRequest
 */
export function getExchangeProtocols(
  exchange: App.ExchangeDetailBase
): ExchangeProtocols {
  const verifiablePresentationRequest =
    exchange.workflowId === 'verify'
      ? getVerifyVPR(exchange as App.ExchangeDetailVerify)
      : getDIDAuthVPR(exchange)
  const serviceEndpoint =
    verifiablePresentationRequest.interact.service[0].serviceEndpoint ?? ''
  // Use the canonical interactions endpoint per VCALM spec
  const interactionsUrl = `${exchange.variables.exchangeHost}/interactions/${exchange.exchangeId}?iuv=1`
  const protocols: ExchangeProtocols = {
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
