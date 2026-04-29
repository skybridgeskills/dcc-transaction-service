import { describe, test, expect } from 'vitest'
import { FakeExchangeClient } from './fake-exchange-client'

describe('FakeExchangeClient', () => {
  const mockProtocols = {
    vcapi: 'https://example.com/workflows/verify/exchanges/123',
    iu: 'https://example.com/interactions/123'
  }

  describe('createExchange', () => {
    test('returns configured protocols', async () => {
      const client = new FakeExchangeClient({
        protocols: mockProtocols,
        states: 'pending'
      })

      const result = await client.createExchange('claim', {})
      expect(result.iu).toBe('https://example.com/interactions/123')
      expect(result.vcapi).toBe(
        'https://example.com/workflows/verify/exchanges/123'
      )
    })
  })

  describe('fetchProtocols', () => {
    test('returns configured protocols', async () => {
      const client = new FakeExchangeClient({
        protocols: mockProtocols,
        states: 'pending'
      })

      const result = await client.fetchProtocols('any-id')
      expect(result).toEqual(mockProtocols)
    })
  })

  describe('fetchExchangeStatus', () => {
    test('returns single configured state', async () => {
      const client = new FakeExchangeClient({
        protocols: mockProtocols,
        states: 'complete'
      })

      const result = await client.fetchExchangeStatus('any-url')
      expect(result.state).toBe('complete')
    })

    test('advances through state sequence', async () => {
      const client = new FakeExchangeClient({
        protocols: mockProtocols,
        states: ['pending', 'active', 'complete']
      })

      expect((await client.fetchExchangeStatus('url')).state).toBe('pending')
      expect((await client.fetchExchangeStatus('url')).state).toBe('active')
      expect((await client.fetchExchangeStatus('url')).state).toBe('complete')
    })

    test('stays on last state when sequence exhausted', async () => {
      const client = new FakeExchangeClient({
        protocols: mockProtocols,
        states: ['pending', 'complete']
      })

      await client.fetchExchangeStatus('url')
      await client.fetchExchangeStatus('url')
      const result = await client.fetchExchangeStatus('url')
      expect(result.state).toBe('complete')
    })

    test('includes workflowId and variables when configured', async () => {
      const variables = {
        features: { details: true },
        results: { default: { verified: true } }
      }
      const client = new FakeExchangeClient({
        protocols: mockProtocols,
        states: 'complete',
        workflowId: 'verify',
        variables
      })

      const result = await client.fetchExchangeStatus('url')
      expect(result.workflowId).toBe('verify')
      expect(result.variables).toEqual(variables)
    })
  })
})
