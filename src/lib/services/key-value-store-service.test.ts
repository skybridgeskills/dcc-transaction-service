import { describe, test, expect } from 'vitest'
import { MemoryKeyValueStoreService } from './memory-key-value-store-service.js'

describe('MemoryKeyValueStoreService', () => {
  test('stores and retrieves values', async () => {
    const store = new MemoryKeyValueStoreService()
    const exchange: App.ExchangeDetailBase = {
      exchangeId: 'test-123',
      workflowId: 'claim',
      tenantName: 'test-tenant',
      state: 'pending',
      expires: new Date(Date.now() + 3600000).toISOString(),
      variables: {
        exchangeHost: 'test-exchange-host',
        challenge: 'test-challenge'
      }
    }

    const setResult = await store.set('test-123', exchange)
    expect(setResult).toBe(true)

    const retrieved = await store.get<App.ExchangeDetailBase>('test-123')
    expect(retrieved).toBeDefined()
    expect(retrieved?.exchangeId).toBe('test-123')
    expect(retrieved?.workflowId).toBe('claim')
  })

  test('returns undefined for non-existent keys', async () => {
    const store = new MemoryKeyValueStoreService()
    const retrieved = await store.get('non-existent')
    expect(retrieved).toBeUndefined()
  })

  test('deletes values', async () => {
    const store = new MemoryKeyValueStoreService()
    const exchange: App.ExchangeDetailBase = {
      exchangeId: 'test-456',
      workflowId: 'verify',
      tenantName: 'test-tenant',
      state: 'pending',
      expires: new Date(Date.now() + 3600000).toISOString(),
      variables: {
        exchangeHost: 'test-exchange-host',
        challenge: 'test-challenge'
      }
    }

    await store.set('test-456', exchange)
    const deleted = await store.delete('test-456')
    expect(deleted).toBe(true)

    const retrieved = await store.get('test-456')
    expect(retrieved).toBeUndefined()
  })

  test('clears all values', async () => {
    const store = new MemoryKeyValueStoreService()
    const exchange: App.ExchangeDetailBase = {
      exchangeId: 'test-789',
      workflowId: 'claim',
      tenantName: 'test-tenant',
      state: 'pending',
      expires: new Date(Date.now() + 3600000).toISOString(),
      variables: {
        exchangeHost: 'test-exchange-host',
        challenge: 'test-challenge'
      }
    }

    await store.set('test-789', exchange)
    await store.clear()

    const retrieved = await store.get('test-789')
    expect(retrieved).toBeUndefined()
  })
})
