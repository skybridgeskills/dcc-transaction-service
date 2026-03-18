import { describe, test, expect, vi, beforeEach } from 'vitest'
import { HttpNotOkResponseError } from './exchange-client'
import { HttpExchangeClient } from './http-exchange-client'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => {
  mockFetch.mockReset()
})

describe('HttpExchangeClient', () => {
  describe('without auth token (cookie mode)', () => {
    const client = new HttpExchangeClient()

    test('fetchProtocols uses credentials: include', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          protocols: {
            vcapi: 'https://example.com/workflows/verify/exchanges/123',
            iu: 'https://example.com/interactions/123',
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
      expect(result.iu).toBe('https://example.com/interactions/123')
      expect(result.verifiablePresentationRequest).toBeUndefined()
    })

    test('fetchExchangeStatus uses credentials: include', async () => {
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
  })

  describe('with auth token (bearer mode)', () => {
    const client = new HttpExchangeClient(
      'https://dev.example.com',
      'test-token-123'
    )

    test('fetchProtocols sends Authorization header', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          protocols: {
            vcapi: 'https://dev.example.com/workflows/claim/exchanges/456',
            iu: 'https://dev.example.com/interactions/456'
          }
        })
      })

      await client.fetchProtocols('456')

      expect(mockFetch).toHaveBeenCalledWith(
        'https://dev.example.com/interactions/456',
        {
          headers: {
            Accept: 'application/json',
            Authorization: 'Bearer test-token-123'
          }
        }
      )
    })

    test('createExchange POSTs variables with auth', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          iu: 'https://dev.example.com/interactions/new-id',
          vcapi: 'https://dev.example.com/workflows/claim/exchanges/new-id'
        })
      })

      const result = await client.createExchange('claim', {
        tenantName: 'test',
        exchangeHost: 'https://dev.example.com',
        vc: '{"type":["VerifiableCredential"]}'
      })

      expect(mockFetch).toHaveBeenCalledWith(
        'https://dev.example.com/workflows/claim/exchanges',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token-123'
          },
          body: JSON.stringify({
            variables: {
              tenantName: 'test',
              exchangeHost: 'https://dev.example.com',
              vc: '{"type":["VerifiableCredential"]}'
            }
          })
        }
      )
      expect(result.iu).toBe('https://dev.example.com/interactions/new-id')
      expect(result.vcapi).toBe(
        'https://dev.example.com/workflows/claim/exchanges/new-id'
      )
    })

    test('createExchange throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized'
      })

      await expect(
        client.createExchange('claim', { tenantName: 'test' })
      ).rejects.toThrow('HTTP 401: Unauthorized')
    })
  })

  describe('error handling', () => {
    const client = new HttpExchangeClient()

    test('fetchProtocols throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 404 })
      await expect(client.fetchProtocols('bad-id')).rejects.toThrow('HTTP 404')
    })

    test('fetchExchangeStatus throws HttpNotOkResponseError on non-ok response', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 401 })
      const err = await client
        .fetchExchangeStatus('https://example.com/bad')
        .catch((e) => e)
      expect(err).toBeInstanceOf(HttpNotOkResponseError)
      expect((err as HttpNotOkResponseError).status).toBe(401)
      expect((err as HttpNotOkResponseError).message).toBe('Status 401')
    })
  })
})
