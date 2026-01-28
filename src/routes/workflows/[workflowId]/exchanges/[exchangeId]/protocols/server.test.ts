import { expect, test, describe, vi } from 'vitest'
import { GET } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../../../../../test-fixtures/sveltekit-test-helpers.js'
import { createTestAppContext, createFakeExchangeService } from '../../../../../../test-fixtures/test-app-context.js'
import { HTTPException } from 'hono/http-exception'
import { createMockDidAuthExchange } from '../../../../../../test-fixtures/testData.js'

describe('GET /workflows/:workflowId/exchanges/:exchangeId/protocols', function () {
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

    const mockExchangeService = createFakeExchangeService({
      getExchangeData: vi.fn().mockResolvedValue(mockExchangeData)
    })

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/test-exchange-123/protocols',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'test-exchange-123' },
      ctx: createTestAppContext({
        exchangeService: mockExchangeService
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.protocols).toBeDefined()
  })

  test('returns 404 for invalid exchange', async function () {
    const mockExchangeService = createFakeExchangeService({
      getExchangeData: vi
        .fn()
        .mockRejectedValue(
          new HTTPException(404, { message: 'Exchange not found' })
        )
    })

    const event = createRequestEvent({
      url: '/workflows/didAuth/exchanges/NO-SUCH-EXCHANGE/protocols',
      method: 'GET',
      params: { workflowId: 'didAuth', exchangeId: 'NO-SUCH-EXCHANGE' },
      ctx: createTestAppContext({
        exchangeService: mockExchangeService
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(404)
    const body = await response.json()
    expect(body.message).toBe('Exchange not found')
  })
})
