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
import { createMockClaimExchange } from '../../../../../../../test-fixtures/testData.js'
import type { OID4VCI } from '../../../../../../../lib/protocols/oid4vci/types.js'
import { calculateTokenExpiration } from '../../../../../../../lib/protocols/oid4vci/utils.js'

describe('GET /workflows/:workflowId/exchanges/:exchangeId/openid/authorization', function () {
  test('returns 200 with authorization code', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    // Pre-populate with pre-authorized code
    const preAuthCode: OID4VCI.StoredCode = {
      code: 'pre-auth-code-123',
      expiresAt: calculateTokenExpiration(600),
      used: false
    }
    await keyValueStore.set(
      `oid4vci:code:${mockExchange.exchangeId}`,
      preAuthCode
    )

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/authorization?pre-authorized_code=pre-auth-code-123',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.code).toBeDefined()
    expect(typeof body.code).toBe('string')
  })

  test('requires pre-authorized_code query parameter', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/authorization',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('pre-authorized_code')
  })

  test('returns 400 for invalid code', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/authorization?pre-authorized_code=invalid-code',
      method: 'GET',
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('Invalid pre-authorized code')
  })

  test('returns 404 for non-existent exchange', async function () {
    const keyValueStore = new MemoryKeyValueStoreService()

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/NO-SUCH-EXCHANGE/openid/authorization?pre-authorized_code=some-code',
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
})
