import { expect, test, describe, vi } from 'vitest'
import { POST } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../test-fixtures/sveltekit-test-helpers.js'
import { createTestAppContext, createFakeExchangeService } from '../../test-fixtures/test-app-context.js'
import { createFakeConfigService } from '../../lib/services/fake-config-service.js'
import { getDataForExchangeSetupPost } from '../../test-fixtures/testData.js'
import type { KeyValueStoreService } from '../../lib/services/key-value-store-service.js'

describe('POST /exchange', function () {
  // Mock services that will be used by createExchangeBatch
  const mockKeyValueStore: KeyValueStoreService = {
    get: vi.fn(),
    set: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true),
    clear: vi.fn().mockResolvedValue(undefined)
  }

  const mockExchangeService = createFakeExchangeService()

  const ctx = createTestAppContext({
    configService: createFakeConfigService({
      tenantAuthenticationEnabled: false,
      tenants: {}
    }),
    keyValueStore: mockKeyValueStore,
    exchangeService: mockExchangeService
  })

  test('returns 400 if no body', async function () {
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: undefined,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toBe('Invalid JSON')
  })

  test('returns 400 if invalid JSON', async function () {
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: '{"invalid/json$',
      headers: {
        'Content-Type': 'application/json'
      },
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toBe('Invalid JSON')
  })

  test('returns array of wallet queries', async function () {
    const testData = getDataForExchangeSetupPost('default')
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: testData,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toBeDefined()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBe(testData.data.length)
  })

  test('returns error if missing exchangeHost', async function () {
    const testData = getDataForExchangeSetupPost('test')
    const { exchangeHost, ...dataWithoutHost } = testData
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: dataWithoutHost,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('exchangeHost')
  })

  test('returns error if missing tenantName', async function () {
    const testData = getDataForExchangeSetupPost('test')
    const { tenantName, ...dataWithoutTenant } = testData
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: dataWithoutTenant,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('tenant name')
  })

  test('returns error if missing vc or subjectData', async function () {
    const testData = getDataForExchangeSetupPost('test')
    // @ts-ignore
    delete testData.data[0].vc
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: testData,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('vc or subjectData')
  })

  test('returns error if missing batchId with subjectData', async function () {
    const testData = getDataForExchangeSetupPost('test') as App.ExchangeBatch
    // @ts-ignore
    delete testData.data[0].vc
    testData.data[0].subjectData = { hello: 'trouble' }
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: testData,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('batchId')
  })

  test('returns error if missing retrievalId', async function () {
    const testData = getDataForExchangeSetupPost('test')
    // @ts-ignore
    delete testData.data[0].retrievalId
    const event = createRequestEvent({
      url: '/exchange',
      method: 'POST',
      body: testData,
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.status).toBe(400)
    const body = await response.json()
    expect(body.message).toContain('retrievalId')
  })

  describe('tenant authentication', function () {
    const tenantAuthCtx = createTestAppContext({
      configService: createFakeConfigService({
        tenantAuthenticationEnabled: true,
        tenants: {
          tenant1: {
            tenantName: 'tenant1',
            tenantToken: 'tenant1token'
          }
        }
      }),
      keyValueStore: mockKeyValueStore,
      exchangeService: mockExchangeService
    })

    test('returns 401 if auth header is set but no matching tenant', async function () {
      const testData = getDataForExchangeSetupPost('default')
      const event = createRequestEvent({
        url: '/exchange',
        method: 'POST',
        body: testData,
        headers: { Authorization: 'Bearer invalid' },
        ctx: tenantAuthCtx
      })

      const response = await callEndpoint(POST, event)
      expect(response.status).toBe(401)
    })

    test('works with correct auth header', async function () {
      const testData = getDataForExchangeSetupPost('tenant1')
      const event = createRequestEvent({
        url: '/exchange',
        method: 'POST',
        body: testData,
        headers: { Authorization: 'Bearer tenant1token' },
        authTenant: {
          tenantName: 'tenant1',
          tenantToken: 'tenant1token'
        },
        ctx: tenantAuthCtx
      })

      const response = await callEndpoint(POST, event)
      expect(response.status).toBe(200)
      const body = await response.json()
      expect(Array.isArray(body)).toBe(true)
    })

    test('fails with body/header tenant mismatch', async function () {
      const testData = getDataForExchangeSetupPost('tenant2')
      const tenantMismatchCtx = createTestAppContext({
        configService: createFakeConfigService({
          tenantAuthenticationEnabled: true,
          tenants: {
            tenant1: {
              tenantName: 'tenant1',
              tenantToken: 'tenant1token'
            },
            tenant2: {
              tenantName: 'tenant2',
              tenantToken: 'tenant2token'
            }
          }
        }),
        keyValueStore: mockKeyValueStore,
        exchangeService: mockExchangeService
      })

      const event = createRequestEvent({
        url: '/exchange',
        method: 'POST',
        body: testData,
        headers: { Authorization: 'Bearer tenant1token' },
        authTenant: {
          tenantName: 'tenant1',
          tenantToken: 'tenant1token'
        },
        ctx: tenantMismatchCtx
      })

      const response = await callEndpoint(POST, event)
      expect(response.status).toBe(401)
    })
  })
})
