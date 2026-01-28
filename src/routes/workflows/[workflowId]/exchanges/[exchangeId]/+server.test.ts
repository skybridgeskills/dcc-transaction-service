import { expect, test, describe, vi } from 'vitest'
import { POST, GET } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../../../../test-fixtures/sveltekit-test-helpers.js'
import { createTestAppContext, createFakeExchangeService } from '../../../../../test-fixtures/test-app-context.js'
import { createFakeConfigService } from '../../../../../lib/services/fake-config-service.js'
import { HTTPException } from 'hono/http-exception'
import { createMockDidAuthExchange } from '../../../../../test-fixtures/testData.js'

describe('POST /workflows/:workflowId/exchanges/:exchangeId', function () {
  const mockExchangeService = createFakeExchangeService()

  const ctx = createTestAppContext({
    configService: createFakeConfigService({
      tenantAuthenticationEnabled: false,
      tenants: {}
    }),
    exchangeService: mockExchangeService
  })

  test('returns 404 if invalid workflowId', async function () {
    const event = createRequestEvent({
      url: '/workflows/NO-SUCH-WORKFLOW/exchanges/123',
      method: 'POST',
      params: { workflowId: 'NO-SUCH-WORKFLOW', exchangeId: '123' },
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.headers.get('Content-Type')).toContain('json')
    const body = await response.json()
    expect(response.status).toBe(404)
    expect(body.message).toBe('Workflow not found')
  })

  test('returns 404 if invalid exchangeId', async function () {
    mockExchangeService.getExchangeData = vi
      .fn()
      .mockRejectedValue(
        new HTTPException(404, { message: 'Exchange not found' })
      )

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/NO-SUCH-EXCHANGE',
      method: 'POST',
      params: { workflowId: 'didAuth', exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: ctx
    })

    const response = await callEndpoint(POST, event)
    expect(response.headers.get('Content-Type')).toContain('json')
    const body = await response.json()
    expect(response.status).toBe(404)
    expect(body.message).toBe('Exchange not found')
  })
})

describe('GET /workflows/:workflowId/exchanges/:exchangeId', function () {
  const mockExchangeService = createFakeExchangeService()

  const ctx = createTestAppContext({
    configService: createFakeConfigService({
      tenantAuthenticationEnabled: false,
      tenants: {}
    }),
    exchangeService: mockExchangeService
  })

  test('returns exchange state for valid exchange', async function () {
    const mockExchangeData = createMockDidAuthExchange({
      tenantName: 'test',
      exchangeId: '123',
      variables: {
        tenantName: 'test',
        exchangeHost: 'http://localhost:4005',
        challenge: 'challenge'
      }
    })

    mockExchangeService.getExchangeData = vi
      .fn()
      .mockResolvedValue(mockExchangeData)

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/123',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: '123' },
      ctx: ctx
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.exchangeId).toBe('123')
  })

  test('returns 404 if invalid workflowId', async function () {
    const event = createRequestEvent({
      url: '/workflows/NO-SUCH-WORKFLOW/exchanges/123',
      method: 'GET',
      params: { workflowId: 'NO-SUCH-WORKFLOW', exchangeId: '123' },
      ctx: ctx
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Workflow not found')
  })

  test('returns 404 if invalid exchangeId', async function () {
    mockExchangeService.getExchangeData = vi
      .fn()
      .mockRejectedValue(
        new HTTPException(404, { message: 'Exchange not found' })
      )

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/NO-SUCH-EXCHANGE',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: ctx
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Exchange not found')
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
      exchangeService: mockExchangeService
    })

    test('returns 401 if auth header is set but no matching tenant', async function () {
      const mockExchangeData = createMockDidAuthExchange({
        tenantName: 'tenant1',
        exchangeId: '123',
        variables: {
          tenantName: 'tenant1',
          exchangeHost: 'http://localhost:4005',
          challenge: 'challenge'
        }
      })

      mockExchangeService.getExchangeData = vi
        .fn()
        .mockResolvedValue(mockExchangeData)

      const event = createRequestEvent({
        url: '/workflows/didAuth/exchanges/123',
        method: 'GET',
        params: { workflowId: 'didAuth', exchangeId: '123' },
        headers: { Authorization: 'Bearer invalid' },
        ctx: tenantAuthCtx
      })

      const response = await callEndpoint(GET, event)
      const body = await response.json()
      expect(response.status).toBe(401)
      expect(body.exchangeId).toBeUndefined()
    })

    test('works with correct auth header', async function () {
      const mockExchangeData = createMockDidAuthExchange({
        tenantName: 'tenant1',
        exchangeId: '123',
        variables: {
          tenantName: 'tenant1',
          exchangeHost: 'http://localhost:4005',
          challenge: 'challenge'
        }
      })

      mockExchangeService.getExchangeData = vi
        .fn()
        .mockResolvedValue(mockExchangeData)

      const event = createRequestEvent({
        url: '/workflows/didAuth/exchanges/123',
        method: 'GET',
        params: { workflowId: 'didAuth', exchangeId: '123' },
        headers: { Authorization: 'Bearer tenant1token' },
        authTenant: {
          tenantName: 'tenant1',
          tenantToken: 'tenant1token'
        },
        ctx: tenantAuthCtx
      })

      const response = await callEndpoint(GET, event)
      const body = await response.json()
      expect(response.status).toBe(200)
      expect(body.exchangeId).toBe('123')
    })

    test('returns 401 if tenant mismatch', async function () {
      const mockExchangeData = createMockDidAuthExchange({
        tenantName: 'tenant2',
        exchangeId: '123',
        variables: {
          tenantName: 'tenant2',
          exchangeHost: 'http://localhost:4005',
          challenge: 'challenge'
        }
      })

      mockExchangeService.getExchangeData = vi
        .fn()
        .mockResolvedValue(mockExchangeData)

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
        exchangeService: mockExchangeService
      })

      const event = createRequestEvent({
        url: '/workflows/didAuth/exchanges/123',
        method: 'GET',
        params: { workflowId: 'didAuth', exchangeId: '123' },
        headers: { Authorization: 'Bearer tenant1token' },
        authTenant: {
          tenantName: 'tenant1',
          tenantToken: 'tenant1token'
        },
        ctx: tenantMismatchCtx
      })

      const response = await callEndpoint(GET, event)
      expect(response.status).toBe(401)
    })
  })
})
