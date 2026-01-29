import { GET } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../../test-fixtures/sveltekit-test-helpers.js'
import { createTestAppContext, populateExchanges } from '../../../test-fixtures/test-app-context.js'
import { MemoryKeyValueStoreService } from '../../../lib/services/memory-key-value-store-service.js'
import { createMockDidAuthExchange } from '../../../test-fixtures/testData.js'

describe('GET /interactions/:exchangeId', function () {
  test('returns protocols for valid exchange', async function () {
    const mockExchangeData = createMockDidAuthExchange({
      tenantName: 'test',
      exchangeId: 'test-exchange-123',
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

    const event = createRequestEvent({
      url: '/interactions/test-exchange-123',
      method: 'GET',
      params: { exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.protocols).toBeDefined()
  })

  test('returns 404 for invalid exchange', async function () {
    // Create empty key-value store (no exchanges pre-populated)
    const keyValueStore = new MemoryKeyValueStoreService()

    const event = createRequestEvent({
      url: '/interactions/NO-SUCH-EXCHANGE',
      method: 'GET',
      params: { exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Exchange not found')
  })
})
