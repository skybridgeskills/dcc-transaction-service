export type ProtocolId = 'vcapi'

export interface InteractionUrlOptions {
  challenge?: string
}

export interface WalletProtocol {
  getInteractionUrl(
    serviceEndpoint: string,
    options?: InteractionUrlOptions
  ): string
}

export interface Wallet {
  id: string
  name: string
  description?: string
  protocols: Partial<Record<ProtocolId, WalletProtocol>>
}
