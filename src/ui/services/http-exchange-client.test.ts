import { describe, test, expect, vi, beforeEach } from 'vitest'
import { HttpExchangeClient } from './http-exchange-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('HttpExchangeClient', () => {
  const client = new HttpExchangeClient()

  describe('fetchProtocols', () => {
    test('fetches protocols with correct URL and headers', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          protocols: {
            vcapi: 'https://example.com/workflows/verify/exchanges/123',
            iu: 'https://example.com/workflows/verify/exchanges/123/protocols?iuv=1',
            verifiablePresentationRequest: { query: {} }
          }
        })
      })

      const result = await client.fetchProtocols('test-exchange-id')

      expect(mockFetch).toHaveBeenCalledWith('/interactions/test-exchange-id', {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      })
      expect(result.vcapi).toBe(
        'https://example.com/workflows/verify/exchanges/123'
      )
      expect(result.iu).toBe(
        'https://example.com/workflows/verify/exchanges/123/protocols?iuv=1'
      )
      expect(result.verifiablePresentationRequest).toBeUndefined()
    })

    test('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })

      await expect(client.fetchProtocols('bad-id')).rejects.toThrow('HTTP 404')
    })
  })

  describe('fetchExchangeStatus', () => {
    test('fetches status with correct URL and headers', async () => {
      const vcapiUrl = 'https://example.com/workflows/verify/exchanges/123'
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ state: 'pending', exchangeId: '123' })
      })

      const result = await client.fetchExchangeStatus(vcapiUrl)

      expect(mockFetch).toHaveBeenCalledWith(vcapiUrl, {
        credentials: 'include',
        headers: { Accept: 'application/json' }
      })
      expect(result.state).toBe('pending')
    })

    test('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 })

      await expect(
        client.fetchExchangeStatus('https://example.com/bad')
      ).rejects.toThrow('Status 401')
    })
  })
})
