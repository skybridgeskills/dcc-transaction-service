import { lcw } from './lcw.js'
import { asuPocket } from './asuPocket.js'
import { mySkillsPocket } from './mySkillsPocket.js'
import type { ProtocolId, Wallet } from './wallet-schema.js'

export const wallets: Wallet[] = [lcw, asuPocket, mySkillsPocket]

export const getWallet = (id: string): Wallet | undefined =>
  wallets.find((w) => w.id === id)

export const getWalletInteractionUrl = (
  walletId: string,
  protocolId: ProtocolId,
  serviceEndpoint: string
): string | undefined => {
  const wallet = getWallet(walletId)
  return wallet?.protocols[protocolId]?.getInteractionUrl(serviceEndpoint)
}

export type { Wallet, WalletProtocol, ProtocolId } from './wallet-schema.js'
