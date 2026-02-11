import { GET } from './+server.js'
import {
  createRequestEvent,
  callEndpoint
} from '../../test-fixtures/sveltekit-test-helpers.js'
import { createTestAppContext } from '../../test-fixtures/test-app-context.js'
import { HttpError } from '../../lib/http-error.js'
import type { KeyValueStoreService } from '../../lib/services/key-value-store-service.js'
import { MemoryKeyValueStoreService } from '../../lib/services/memory-key-value-store-service.js'

describe('GET /healthz', function () {
  test('returns 200 if healthy', async function () {
    // Use a real MemoryKeyValueStoreService instance
    const keyValueStore = new MemoryKeyValueStoreService()
    const ctx = createTestAppContext({
      keyValueStore: keyValueStore
    })

    const event = createRequestEvent({
      url: '/healthz',
      method: 'GET',
      ctx: ctx
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      message: 'transaction-service server status: ok.',
      healthy: true
    })
  })

  test('returns 503 if internal error', async function () {
    // Create a mock keyValueStore that throws an error
    const mockKeyValueStore: KeyValueStoreService = {
      get: vi.fn().mockRejectedValue(new Error('Storage failure')),
      set: vi.fn().mockRejectedValue(new Error('Storage failure')),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined)
    }

    const event = createRequestEvent({
      url: '/healthz',
      method: 'GET',
      ctx: createTestAppContext({
        keyValueStore: mockKeyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body).toHaveProperty('healthy', false)
  })

  test('returns error status if HttpError thrown', async function () {
    // Create a mock keyValueStore that throws HttpError
    // Note: HttpError status is preserved by the endpoint
    const mockKeyValueStore: KeyValueStoreService = {
      get: vi
        .fn()
        .mockRejectedValue(new HttpError(500, 'Failed to save exchange.')),
      set: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true),
      clear: vi.fn().mockResolvedValue(undefined)
    }

    const event = createRequestEvent({
      url: '/healthz',
      method: 'GET',
      ctx: createTestAppContext({
        keyValueStore: mockKeyValueStore
      })
    })

    const response = await callEndpoint(GET, event)
    expect(response.status).toBe(500)
  })
})
