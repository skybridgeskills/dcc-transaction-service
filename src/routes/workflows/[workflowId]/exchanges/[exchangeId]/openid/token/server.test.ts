import { expect, test, describe } from 'vitest'
import { POST } from './+server.js'
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

describe('POST /workflows/:workflowId/exchanges/:exchangeId/openid/token', function () {
  test('returns 200 with token for pre-authorized_code grant', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

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
      url: '/workflows/claim/exchanges/test-exchange-123/openid/token',
      method: 'POST',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'pre-auth-code-123'
      },
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.access_token).toBeDefined()
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBeDefined()
    expect(body.c_nonce).toBeDefined()
  })

  test('returns 200 with token for authorization_code grant', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const authCode: OID4VCI.StoredCode = {
      code: 'auth-code-123',
      expiresAt: calculateTokenExpiration(600),
      used: false
    }
    await keyValueStore.set(
      `oid4vci:authcode:${mockExchange.exchangeId}`,
      authCode
    )

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/token',
      method: 'POST',
      body: {
        grant_type: 'authorization_code',
        code: 'auth-code-123'
      },
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.access_token).toBeDefined()
    expect(body.token_type).toBe('Bearer')
  })

  test('requires grant_type in body', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/token',
      method: 'POST',
      body: {},
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('grant_type')
  })

  test('returns 400 for invalid grant_type', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/token',
      method: 'POST',
      body: {
        grant_type: 'invalid_grant_type'
      },
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('Unsupported grant_type')
  })

  test('returns 400 for missing code', async function () {
    const mockExchange = createMockClaimExchange({
      exchangeId: 'test-exchange-123',
      workflowId: 'claim'
    })

    const keyValueStore = new MemoryKeyValueStoreService()
    await populateExchanges(keyValueStore, {
      'test-exchange-123': mockExchange
    })

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/test-exchange-123/openid/token',
      method: 'POST',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
      },
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
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
      url: '/workflows/claim/exchanges/test-exchange-123/openid/token',
      method: 'POST',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'invalid-code'
      },
      params: { workflowId: 'claim', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('Invalid pre-authorized code')
  })

  test('returns 404 for non-existent exchange', async function () {
    const keyValueStore = new MemoryKeyValueStoreService()

    const event = createRequestEvent({
      url: '/workflows/claim/exchanges/NO-SUCH-EXCHANGE/openid/token',
      method: 'POST',
      body: {
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'some-code'
      },
      params: { workflowId: 'claim', exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: createTestAppContext({
        keyValueStore
      })
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Exchange not found')
  })
})
