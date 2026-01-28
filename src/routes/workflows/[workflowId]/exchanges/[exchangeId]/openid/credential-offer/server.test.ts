import { expect, test, describe } from 'vitest'
import { GET } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../../../../../../test-fixtures/sveltekit-test-helpers.js'
import {
  createTestAppContext,
  populateExchanges
} from '../../../../../../../test-fixtures/test-app-context.js'
import { MemoryKeyValueStoreService } from '../../../../../../../lib/services/memory-key-value-store-service.js'
import {
  createMockClaimExchange,
  createMockDidAuthExchange
} from '../../../../../../../test-fixtures/testData.js'

describe('GET /workflows/:workflowId/exchanges/:exchangeId/openid/credential-offer', function () {
  test('returns 200 with credential offer for claim exchange', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim',
      variables: {
        exchangeHost: 'http://localhost:4005',
        vc: JSON.stringify({
          type: ['VerifiableCredential', 'TestCredential']
        })
      }
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/credential-offer',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.credential_issuer).toBe('http://localhost:4005')
    expect(body.credential_offer_uri).toBeDefined()
    expect(body.credentials).toBeDefined()
    expect(body.grants).toBeDefined()
  })

  test('returns 400 for non-claim exchange', async function () {
    const mockExchange = createMockDidAuthExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'didAuth'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/test-exchange-123/openid/credential-offer',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('claim exchanges')
  })

  test('returns 404 for non-existent exchange', async function () {
    const keyValueStore = new MemoryKeyValueStoreService()

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/NO-SUCH-EXCHANGE/openid/credential-offer',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Exchange not found')
  })

  test('credential offer structure is valid', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim',
      variables: {
        exchangeHost: 'http://localhost:4005',
        vc: JSON.stringify({
          type: ['VerifiableCredential', 'OpenBadgeCredential']
        })
      }
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/credential-offer',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    const body = await response.json()

    expect(body.credential_offer_uri).toBe(
      'http://localhost:4005/workflows/claim/exchanges/test-exchange-123/openid/credential-offer'
    )
    expect(body.credential_issuer).toBe('http://localhost:4005')
    expect(Array.isArray(body.credentials)).toBe(true)
    expect(body.credentials[0].format).toBe('ldp_vc')
    expect(body.credentials[0].types).toContain('VerifiableCredential')
    expect(body.credentials[0].types).toContain('OpenBadgeCredential')
    expect(
      body.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    ).toBeDefined()
  })
})
