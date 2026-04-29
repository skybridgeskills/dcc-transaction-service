import { lcw } from './lcw.js'
import { asuPocket } from './asuPocket.js'
import { mySkillsPocket } from './mySkillsPocket.js'
import { learnCard } from './learnCard.js'
import type {
  InteractionUrlOptions,
  ProtocolId,
  Wallet
} from './wallet-schema.js'

export const wallets: Wallet[] = [lcw, asuPocket, mySkillsPocket, learnCard]

export const getWallet = (id: string): Wallet | undefined =>
  wallets.find((w) => w.id === id)

export const getWalletInteractionUrl = (
  walletId: string,
  protocolId: ProtocolId,
  serviceEndpoint: string,
  options?: InteractionUrlOptions
): string | undefined => {
  const wallet = getWallet(walletId)
  return wallet?.protocols[protocolId]?.getInteractionUrl(
    serviceEndpoint,
    options
  )
}

export type {
  InteractionUrlOptions,
  Wallet,
  WalletProtocol,
  ProtocolId
} from './wallet-schema.js'
