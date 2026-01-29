/**
 * Wallet Invocation Module
 * Handles QR code generation and deep link creation for wallet invocation
 */

import QRCode from 'qrcode'
import type { WalletConfig, ProtocolType } from './wallet-config.js'
import type { AvailableProtocol } from './wallet-selector.js'

export interface InvocationResult {
  qrCodeDataUrl?: string
  deepLinkUrl?: string
  url?: string
}

/**
 * Generate deep link URL for a protocol and wallet
 */
export function generateDeepLinkUrl(
  protocol: ProtocolType,
  wallet: WalletConfig,
  protocolUrl?: string
): string | null {
  const scheme = wallet.deepLinkSchemes[protocol]
  if (!scheme) {
    return null
  }

  switch (protocol) {
    case 'OID4VCI':
      // OID4VCI deep link format: openid-credential-offer://?credential_offer_uri=<url>
      if (protocolUrl) {
        return `${scheme}?credential_offer_uri=${encodeURIComponent(protocolUrl)}`
      }
      return null

    case 'OID4VP':
      // OID4VP deep link format: openid4vp://?request_uri=<url> or openid4vp://?request=<jwt>
      // For now, we'll use request_uri if we have a URL
      if (protocolUrl) {
        return `${scheme}?request_uri=${encodeURIComponent(protocolUrl)}`
      }
      // If we have verifiablePresentationRequest, we could encode it as JWT
      // For now, return null if no URL
      return null

    case 'LCW':
      // LCW deep link format: lcw://<url>
      if (protocolUrl) {
        return `${scheme}${protocolUrl}`
      }
      return null

    default:
      // For other protocols, use the scheme + URL
      if (protocolUrl) {
        return `${scheme}${protocolUrl}`
      }
      return null
  }
}

/**
 * Generate QR code data URL from a string
 */
export async function generateQRCodeDataUrl(
  data: string,
  options?: QRCode.QRCodeToDataURLOptions
): Promise<string> {
  const defaultOptions: QRCode.QRCodeToDataURLOptions = {
    errorCorrectionLevel: 'M',
    type: 'image/png',
    margin: 1,
    color: {
      dark: '#000000',
      light: '#FFFFFF'
    },
    width: 300
  }

  return QRCode.toDataURL(data, { ...defaultOptions, ...options })
}

/**
 * Generate invocation result for a wallet and protocol
 * Handles same-device vs cross-device preferences
 */
export async function generateInvocation(
  wallet: WalletConfig,
  protocol: ProtocolType,
  availableProtocol: AvailableProtocol,
  prefersSameDevice?: boolean
): Promise<InvocationResult> {
  const useSameDevice =
    prefersSameDevice !== undefined ? prefersSameDevice : wallet.prefersSameDevice

  const result: InvocationResult = {}

  if (useSameDevice) {
    // Same device: generate deep link
    const deepLinkUrl = generateDeepLinkUrl(
      protocol,
      wallet,
      availableProtocol.url
    )
    if (deepLinkUrl) {
      result.deepLinkUrl = deepLinkUrl
    } else {
      // Fallback to URL if deep link not available
      result.url = availableProtocol.url
    }
  } else {
    // Cross-device: generate QR code
    // For QR codes, we use the deep link if available, otherwise the URL
    const deepLinkUrl = generateDeepLinkUrl(
      protocol,
      wallet,
      availableProtocol.url
    )
    const qrData = deepLinkUrl || availableProtocol.url || ''

    if (qrData) {
      try {
        result.qrCodeDataUrl = await generateQRCodeDataUrl(qrData)
      } catch (error) {
        console.error('Failed to generate QR code:', error)
        // Fallback to URL
        result.url = qrData
      }
    }
  }

  return result
}

/**
 * Generate OID4VP deep link URL
 * Standard format: openid4vp://?request_uri=<url> or openid4vp://?request=<jwt>
 */
export function generateOID4VPDeepLink(
  requestUri: string,
  walletScheme?: string
): string {
  const scheme = walletScheme || 'openid4vp://'
  return `${scheme}?request_uri=${encodeURIComponent(requestUri)}`
}

/**
 * Generate OID4VCI deep link URL
 * Standard format: openid-credential-offer://?credential_offer_uri=<url>
 */
export function generateOID4VCIDeepLink(
  credentialOfferUri: string,
  walletScheme?: string
): string {
  const scheme = walletScheme || 'openid-credential-offer://'
  return `${scheme}?credential_offer_uri=${encodeURIComponent(credentialOfferUri)}`
}
