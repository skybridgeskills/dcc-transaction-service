export type ProtocolId = 'vcapi'

export interface WalletProtocol {
  getInteractionUrl(serviceEndpoint: string): string
}

export interface Wallet {
  id: string
  name: string
  description?: string
  protocols: Partial<Record<ProtocolId, WalletProtocol>>
}
