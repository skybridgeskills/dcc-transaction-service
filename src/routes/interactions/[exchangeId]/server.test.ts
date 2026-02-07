import { load } from './+page.server.js'
import { createRequestEvent } from '../../../test-fixtures/sveltekit-test-helpers.js'
import {
  createTestAppContext,
  populateExchanges
} from '../../../test-fixtures/test-app-context.js'
import { MemoryKeyValueStoreService } from '../../../lib/services/memory-key-value-store-service.js'
import { createMockDidAuthExchange } from '../../../test-fixtures/testData.js'
import { runInAppContext } from '../../../lib/app/app-context.js'

describe('load /interactions/:exchangeId', function () {
  test('redirects JSON requests to protocols route', async function () {
    const mockExchangeData = createMockDidAuthExchange({
      tenantName: 'test',
      exchangeId: 'test-exchange-123',
      workflowId: 'didAuth',
      variables: {
        tenantName: 'test',
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge123'
      }
    })

    // Create key-value store and pre-populate with exchange
    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchangeData
    })

    const ctx = createTestAppContext({
      keyValueStore
    })

    const event = createRequestEvent({
      url: '/interactions/test-exchange-123',
      method: 'GET',
      params: { exchangeId: 'test-exchange-123' },
      headers: { Accept: 'application/json' },
      ctx
    })

    try {
      await runInAppContext(ctx, async () => {
        return load(event)
      })
      expect.fail('Should have thrown redirect')
    } catch (e: any) {
      // SvelteKit redirect throws an error with status and location
      expect(e.status).toBe(302)
      expect(e.location).toBe(
        '/workflows/didAuth/exchanges/test-exchange-123/protocols'
      )
    }
  })

  test('returns exchange data for HTML requests', async function () {
    const mockExchangeData = createMockDidAuthExchange({
      tenantName: 'test',
      exchangeId: 'test-exchange-123',
      workflowId: 'didAuth',
      variables: {
        tenantName: 'test',
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge123'
      }
    })

    // Create key-value store and pre-populate with exchange
    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchangeData
    })

    const ctx = createTestAppContext({
      keyValueStore
    })

    const event = createRequestEvent({
      url: '/interactions/test-exchange-123',
      method: 'GET',
      params: { exchangeId: 'test-exchange-123' },
      headers: { Accept: 'text/html' },
      ctx
    })

    const result = await runInAppContext(ctx, async () => {
      return load(event)
    })
    expect(result.exchange).toBeDefined()
    expect(result.exchange.exchangeId).toBe('test-exchange-123')
  })

  test('redirects requests with no Accept header to protocols route', async function () {
    const mockExchangeData = createMockDidAuthExchange({
      tenantName: 'test',
      exchangeId: 'test-exchange-123',
      workflowId: 'didAuth',
      variables: {
        tenantName: 'test',
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge123'
      }
    })

    // Create key-value store and pre-populate with exchange
    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchangeData
    })

    const ctx = createTestAppContext({
      keyValueStore
    })

    const event = createRequestEvent({
      url: '/interactions/test-exchange-123',
      method: 'GET',
      params: { exchangeId: 'test-exchange-123' },
      headers: {},
      ctx
    })

    try {
      await runInAppContext(ctx, async () => {
        return load(event)
      })
      expect.fail('Should have thrown redirect')
    } catch (e: any) {
      // SvelteKit redirect throws an error with status and location
      expect(e.status).toBe(302)
      expect(e.location).toBe(
        '/workflows/didAuth/exchanges/test-exchange-123/protocols'
      )
    }
  })

  test('returns 404 for invalid exchange', async function () {
    // Create empty key-value store (no exchanges pre-populated)
    const keyValueStore = new MemoryKeyValueStoreService()
    const ctx = createTestAppContext({
      keyValueStore
    })

    const event = createRequestEvent({
      url: '/interactions/NO-SUCH-EXCHANGE',
      method: 'GET',
      params: { exchangeId: 'NO-SUCH-EXCHANGE' },
      headers: { Accept: 'text/html' },
      ctx
    })

    try {
      await runInAppContext(ctx, async () => {
        return load(event)
      })
      expect.fail('Should have thrown error')
    } catch (e: any) {
      // SvelteKit error throws an error with status
      expect(e.status).toBe(404)
    }
  })
})
