import { expect, test, describe } from 'vitest'
import { GET } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../../../../../test-fixtures/sveltekit-test-helpers.js'
import {
  createTestAppContext,
  populateExchanges
} from '../../../../../../test-fixtures/test-app-context.js'
import { MemoryKeyValueStoreService } from '../../../../../../lib/services/memory-key-value-store-service.js'
import {
  createMockDidAuthExchange,
  createMockClaimExchange
} from '../../../../../../test-fixtures/testData.js'

describe('GET /workflows/:workflowId/exchanges/:exchangeId/protocols', function () {
  test('returns protocols for valid exchange', async function () {
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

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/test-exchange-123/protocols',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'test-exchange-123' },
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
      url: '/workflows/didAuth/exchanges/NO-SUCH-EXCHANGE/protocols',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Exchange not found')
  })

  test('OID4VCI appears in protocols for claim exchanges', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge123',
        vc: JSON.stringify({
          type: ['VerifiableCredential']
        })
      }
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/protocols',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.protocols.OID4VCI).toBeDefined()
    expect(typeof body.protocols.OID4VCI).toBe('string')
    expect(body.protocols.OID4VCI).toContain('openid-credential-offer://')
  })

  test('OID4VCI does NOT appear for didAuth exchanges', async function () {
    const mockExchange = createMockDidAuthExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'didAuth',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge123'
      }
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/test-exchange-123/protocols',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.protocols.OID4VCI).toBeUndefined()
  })

  test('OID4VCI URL format is correct', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim',
      variables: {
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge123',
        vc: JSON.stringify({
          type: ['VerifiableCredential']
        })
      }
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/protocols',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    const body = await response.json()
    expect(body.protocols.OID4VCI).toMatch(/^openid-credential-offer:\/\//)
    expect(body.protocols.OID4VCI).toContain('credential_offer_uri=')
    // URL is encoded in the deep link
    expect(body.protocols.OID4VCI).toContain(
      'http%3A%2F%2Flocalhost%3A4005%2Fworkflows%2Fclaim%2Fexchanges%2Ftest-exchange-123%2Fopenid%2Fcredential-offer'
    )
  })
})
