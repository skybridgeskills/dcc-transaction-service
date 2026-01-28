/*!
 * Copyright (c) 2023 Digital Credentials Consortium. All rights reserved.
 */
import { HTTPException } from 'hono/http-exception'
import { getApp } from '../app/app-context.js'

/**
 * Retrieves an exchange by exchangeId only, without workflowId validation.
 * Used for endpoints like /interactions/:exchangeId where workflowId is not known upfront.
 * @throws {HTTPException} Unknown exchangeId
 * @returns returns stored data if exchangeId exists
 */
export const getExchangeById = async (exchangeId: string) => {
  const app = getApp()
  if (!app.keyValueStore) {
    throw new HTTPException(500, {
      message: 'KeyValueStore not available in app context'
    })
  }
  const storedData = await app.keyValueStore.get(exchangeId)
  if (!storedData) {
    throw new HTTPException(404, { message: 'Unknown exchangeId.' })
  }
  return storedData
}

/**
 * @throws {} Unknown exchangeID
 * @returns returns stored data if exchangeId exists and workflowId matches
 */
export const getExchangeData = async (
  exchangeId: string,
  workflowId: string
) => {
  const app = getApp()
  if (!app.keyValueStore) {
    throw new HTTPException(500, {
      message: 'KeyValueStore not available in app context'
    })
  }
  const storedData = await app.keyValueStore.get(exchangeId)
  if (!storedData || storedData.workflowId !== workflowId) {
    throw new HTTPException(404, { message: 'Unknown exchangeId.' })
  }
  return storedData
}

/**
 * Sets up one exchange and save it to Keyv. The local exchangeId is used as the key for the
 * record. Success/Failure boolean is returned.
 */
export const saveExchange = async (data: App.ExchangeDetailBase) => {
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

/**
 * This is meant for testing failures. It clears the key-value store.
 */
export const clearKeyv = async () => {
  const app = getApp()
  if (app.keyValueStore) {
    await app.keyValueStore.clear()
  }
}
