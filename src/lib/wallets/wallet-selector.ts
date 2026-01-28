/**
 * Wallet Selector Logic
 * Determines supported protocols for wallets and handles protocol prioritization
 */

import type { WalletConfig, ProtocolType, ProtocolConfig } from './wallet-config.js'
import { getAllWalletConfigs, getWalletConfig } from './wallet-config.js'

export interface AvailableProtocol {
  type: ProtocolType
  url?: string
}

export interface WalletSelection {
  wallet: WalletConfig
  selectedProtocol: ProtocolType
  availableProtocols: AvailableProtocol[]
}

/**
 * Get supported protocols for a wallet, ordered by priority
 */
export function getSupportedProtocols(
  wallet: WalletConfig
): ProtocolConfig[] {
  return [...wallet.supportedProtocols].sort((a, b) => a.priority - b.priority)
}

/**
 * Determine which protocols are available from exchange service
 * Based on the protocols returned by exchangeService.getExchangeProtocols()
 */
export function getAvailableProtocolsFromExchange(protocols: {
  iu?: string
  vcapi?: string
  lcw?: string
  OID4VCI?: string
  verifiablePresentationRequest?: any
}): AvailableProtocol[] {
  const available: AvailableProtocol[] = []

  // OID4VP is available if verifiablePresentationRequest exists
  if (protocols.verifiablePresentationRequest) {
    available.push({ type: 'OID4VP' })
  }

  // OID4VCI is available if OID4VCI URL exists
  if (protocols.OID4VCI) {
    available.push({ type: 'OID4VCI', url: protocols.OID4VCI })
  }

  // LCW is available if lcw URL exists
  if (protocols.lcw) {
    available.push({ type: 'LCW', url: protocols.lcw })
  }

  // VCAPI is available if vcapi URL exists
  if (protocols.vcapi) {
    available.push({ type: 'VCAPI', url: protocols.vcapi })
  }

  // IU is available if iu URL exists
  if (protocols.iu) {
    available.push({ type: 'IU', url: protocols.iu })
  }

  return available
}

/**
 * Find the best matching protocol for a wallet from available protocols
 * Returns the highest priority protocol that the wallet supports and is available
 */
export function findBestProtocol(
  wallet: WalletConfig,
  availableProtocols: AvailableProtocol[]
): ProtocolType | null {
  const supportedProtocols = getSupportedProtocols(wallet)
  const availableProtocolTypes = new Set(
    availableProtocols.map((p) => p.type)
  )

  // Find the first supported protocol that is also available
  for (const protocolConfig of supportedProtocols) {
    if (availableProtocolTypes.has(protocolConfig.type)) {
      return protocolConfig.type
    }
  }

  return null
}

/**
 * Get wallets that support at least one of the available protocols
 */
export function getCompatibleWallets(
  availableProtocols: AvailableProtocol[]
): WalletConfig[] {
  const availableProtocolTypes = new Set(
    availableProtocols.map((p) => p.type)
  )

  return getAllWalletConfigs().filter((wallet) =>
    wallet.supportedProtocols.some((p) => availableProtocolTypes.has(p.type))
  )
}

/**
 * Create a wallet selection with protocol information
 */
export function createWalletSelection(
  walletId: string,
  availableProtocols: AvailableProtocol[],
  selectedProtocol?: ProtocolType
): WalletSelection | null {
  const wallet = getWalletConfig(walletId)
  if (!wallet) {
    return null
  }

  // Get protocols that this wallet supports and are available
  const walletAvailableProtocols = availableProtocols.filter((ap) =>
    wallet.supportedProtocols.some((sp) => sp.type === ap.type)
  )

  if (walletAvailableProtocols.length === 0) {
    return null
  }

  // Determine selected protocol
  let finalSelectedProtocol: ProtocolType
  if (selectedProtocol) {
    // Verify the selected protocol is supported and available
    const isSupported = wallet.supportedProtocols.some(
      (p) => p.type === selectedProtocol
    )
    const isAvailable = walletAvailableProtocols.some(
      (p) => p.type === selectedProtocol
    )
    if (isSupported && isAvailable) {
      finalSelectedProtocol = selectedProtocol
    } else {
      // Fall back to best protocol from wallet's available protocols
      const bestProtocol = findBestProtocol(wallet, availableProtocols)
      finalSelectedProtocol = bestProtocol || walletAvailableProtocols[0].type
    }
  } else {
    // Auto-select best protocol from wallet's available protocols
    const bestProtocol = findBestProtocol(wallet, availableProtocols)
    finalSelectedProtocol = bestProtocol || walletAvailableProtocols[0].type
  }

  return {
    wallet,
    selectedProtocol: finalSelectedProtocol,
    availableProtocols: walletAvailableProtocols
  }
}

/**
 * Check if advanced protocol selection mode should be shown
 * Shows when multiple protocols are available for a wallet
 */
export function shouldShowAdvancedProtocolSelection(
  wallet: WalletConfig,
  availableProtocols: AvailableProtocol[]
): boolean {
  const walletAvailableProtocols = availableProtocols.filter((ap) =>
    wallet.supportedProtocols.some((sp) => sp.type === ap.type)
  )
  return walletAvailableProtocols.length > 1
}
