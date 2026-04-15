/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { HTTPException } from 'hono/http-exception'
import Keyv from 'keyv'
import { createKeyvStore } from './keyv-store.js'

let keyv: Keyv<App.ExchangeDetailBase>

/**
 * Initializes the keyv store for exchange transaction data.
 */
export const initializeTransactionManager = () => {
  if (!keyv) {
    keyv = createKeyvStore<App.ExchangeDetailBase>('exchange')
  }
}
initializeTransactionManager()

/**
 * @throws {} Unknown exchangeID
 * @returns returns stored data if exchangeId exists
 */
export const getExchangeData = async (
  exchangeId: string,
  workflowId: string
) => {
  const storedData = await keyv.get(exchangeId)
  if (!storedData || storedData.workflowId !== workflowId) {
    throw new HTTPException(404, { message: 'Unknown exchangeId.' })
  }
  return storedData
}

/**
 * Retrieves exchange data by exchangeId only, without requiring a workflowId.
 * Used by the interaction URL endpoint where the workflowId is not in the URL path.
 */
export const getExchangeDataById = async (exchangeId: string) => {
  const storedData = await keyv.get(exchangeId)
  if (!storedData) {
    throw new HTTPException(404, { message: 'Unknown exchangeId.' })
  }
  return storedData
}

/**
 * Sets up one exchange and save it to Keyv. The local exchangeId is used as the key for the
 * record. Success/Failure boolean is returned.
 */
export const saveExchange = async (data: App.ExchangeDetailBase) => {
  const ttl = new Date(data.expires).getTime() - Date.now() + 1000
  const success = await keyv.set(data.exchangeId, data, ttl)
  if (!success) {
    throw new HTTPException(500, { message: 'Failed to save exchange.' })
  }
  return success
}

/**
 * This is meant for testing failures. It deletes the keyv store entirely.
 */
export const clearKeyv = () => {
  // @ts-ignore
  keyv = undefined
}
