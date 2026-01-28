/**
 * Wallet Configuration Module
 * Defines wallet configurations including metadata, supported protocols, and deep link schemes
 */

export type ProtocolType = 'OID4VP' | 'OID4VCI' | 'LCW' | 'VCAPI' | 'IU'

export interface ProtocolConfig {
  type: ProtocolType
  priority: number // Lower number = higher priority
}

export interface WalletConfig {
  id: string
  name: string
  description: string
  supportedProtocols: ProtocolConfig[]
  deepLinkSchemes: {
    OID4VP?: string
    OID4VCI?: string
    [key: string]: string | undefined
  }
  prefersSameDevice: boolean // true = prefers same device, false = prefers cross-device
}

/**
 * Wallet configurations for supported wallets
 */
export const WALLET_CONFIGS: Record<string, WalletConfig> = {
  lcw: {
    id: 'lcw',
    name: 'Learner Credential Wallet',
    description: 'A wallet for managing learner credentials',
    supportedProtocols: [
      { type: 'LCW', priority: 1 },
      { type: 'VCAPI', priority: 3 }
    ],
    deepLinkSchemes: {
      LCW: 'lcw://'
    },
    prefersSameDevice: false
  },
  asuPocket: {
    id: 'asu-pocket',
    name: 'ASU Pocket',
    description: 'Arizona State University wallet application',
    supportedProtocols: [
      { type: 'OID4VP', priority: 1 },
      { type: 'OID4VCI', priority: 2 },
      { type: 'VCAPI', priority: 3 }
    ],
    deepLinkSchemes: {
      OID4VP: 'asupocket://',
      OID4VCI: 'asupocket://'
    },
    prefersSameDevice: true
  },
  asuMySkillsPocket: {
    id: 'asu-myskills-pocket',
    name: 'ASU My Skills Pocket',
    description: 'Arizona State University skills wallet application',
    supportedProtocols: [
      { type: 'OID4VP', priority: 1 },
      { type: 'OID4VCI', priority: 2 },
      { type: 'VCAPI', priority: 3 }
    ],
    deepLinkSchemes: {
      OID4VP: 'msprequest://',
      OID4VCI: 'msprequest://'
    },
    prefersSameDevice: true
  },
  learnCard: {
    id: 'learncard',
    name: 'LearnCard',
    description: 'A universal wallet for verifiable credentials',
    supportedProtocols: [
      { type: 'OID4VP', priority: 1 },
      { type: 'OID4VCI', priority: 2 },
      { type: 'VCAPI', priority: 3 }
    ],
    deepLinkSchemes: {
      OID4VP: 'openid4vp://',
      OID4VCI: 'openid-credential-offer://'
    },
    prefersSameDevice: false
  }
}

/**
 * Get wallet configuration by ID
 */
export function getWalletConfig(walletId: string): WalletConfig | undefined {
  // First try direct key lookup
  if (WALLET_CONFIGS[walletId]) {
    return WALLET_CONFIGS[walletId]
  }
  // Then search by ID field
  return Object.values(WALLET_CONFIGS).find((wallet) => wallet.id === walletId)
}

/**
 * Get all wallet configurations
 */
export function getAllWalletConfigs(): WalletConfig[] {
  return Object.values(WALLET_CONFIGS)
}

/**
 * Get wallets that support a specific protocol
 */
export function getWalletsForProtocol(protocol: ProtocolType): WalletConfig[] {
  return getAllWalletConfigs().filter((wallet) =>
    wallet.supportedProtocols.some((p) => p.type === protocol)
  )
}
