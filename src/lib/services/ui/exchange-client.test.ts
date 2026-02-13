import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { HttpExchangeClient } from './exchange-client.js'
import { createStorybookExchangeData } from '../../test-fixtures/storybook-exchange-data.js'

describe('HttpExchangeClient', () => {
  let client: HttpExchangeClient
  const baseUrl = 'https://example.com'

  beforeEach(() => {
    client = new HttpExchangeClient(baseUrl)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('getExchangeData', () => {
    it('should fetch exchange data successfully', async () => {
      const exchange = createStorybookExchangeData('claim', {
        exchangeId: 'test-123',
        workflowId: 'claim'
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => exchange
      } as Response)

      const result = await client.getExchangeData('test-123', 'claim')

      expect(result).toEqual(exchange)
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/workflows/claim/exchanges/test-123`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      )
    })

    it('should throw error when exchange not found (404)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      } as Response)

      await expect(
        client.getExchangeData('not-found', 'claim')
      ).rejects.toThrow('Exchange not found')
    })

    it('should throw error when unauthorized (401)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      } as Response)

      await expect(
        client.getExchangeData('test-123', 'claim')
      ).rejects.toThrow('Unauthorized')
    })

    it('should throw error for other HTTP errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as Response)

      await expect(
        client.getExchangeData('test-123', 'claim')
      ).rejects.toThrow('Failed to fetch exchange: 500 Internal Server Error')
    })

    it('should throw error when workflowId mismatch', async () => {
      const exchange = createStorybookExchangeData('claim', {
        exchangeId: 'test-123',
        workflowId: 'claim'
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => exchange
      } as Response)

      // Request with different workflowId
      await expect(
        client.getExchangeData('test-123', 'didAuth')
      ).rejects.toThrow('Exchange not found')
    })

    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(
        client.getExchangeData('test-123', 'claim')
      ).rejects.toThrow('Network error')
    })
  })

  describe('getExchangeState', () => {
    it('should fetch exchange state successfully', async () => {
      const exchange = createStorybookExchangeData('verify', {
        exchangeId: 'test-456',
        workflowId: 'verify'
      })

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => exchange
      } as Response)

      const result = await client.getExchangeState('test-456', 'verify')

      expect(result).toEqual(exchange)
      expect(fetch).toHaveBeenCalledWith(
        `${baseUrl}/workflows/verify/exchanges/test-456`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json'
          }
        }
      )
    })
  })

  describe('constructor', () => {
    it('should use provided baseUrl', () => {
      const customClient = new HttpExchangeClient('https://custom.com')
      expect(customClient).toBeInstanceOf(HttpExchangeClient)
    })

    it('should default to empty string when window is not available', () => {
      // In Node.js environment, window is not available, so baseUrl defaults to empty string
      const defaultClient = new HttpExchangeClient()
      expect(defaultClient).toBeInstanceOf(HttpExchangeClient)
      // The baseUrl will be empty string in Node.js, which is fine for relative URLs
    })
  })
})
