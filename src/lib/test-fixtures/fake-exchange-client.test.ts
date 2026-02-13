import { describe, it, expect } from 'vitest'
import {
  FakeExchangeClient,
  createFakeExchangeClient
} from './fake-exchange-client.js'
import { createStorybookExchangeData } from './storybook-exchange-data.js'

describe('FakeExchangeClient', () => {
  describe('constructor', () => {
    it('should create client with custom exchanges', () => {
      const exchange1 = createStorybookExchangeData('claim', {
        exchangeId: 'test-1',
        workflowId: 'claim'
      })
      const exchange2 = createStorybookExchangeData('verify', {
        exchangeId: 'test-2',
        workflowId: 'verify'
      })

      const client = new FakeExchangeClient({
        exchanges: {
          'claim:test-1': exchange1,
          'verify:test-2': exchange2
        }
      })

      expect(client).toBeInstanceOf(FakeExchangeClient)
    })

    it('should create client with default exchange', () => {
      const defaultExchange = createStorybookExchangeData('claim', {
        exchangeId: 'default',
        workflowId: 'claim'
      })

      const client = new FakeExchangeClient({
        defaultExchange
      })

      expect(client).toBeInstanceOf(FakeExchangeClient)
    })

    it('should create empty client', () => {
      const client = new FakeExchangeClient()
      expect(client).toBeInstanceOf(FakeExchangeClient)
    })
  })

  describe('getExchangeData', () => {
    it('should return exchange from exchanges map', async () => {
      const exchange = createStorybookExchangeData('claim', {
        exchangeId: 'test-123',
        workflowId: 'claim'
      })

      const client = new FakeExchangeClient({
        exchanges: {
          'claim:test-123': exchange
        }
      })

      const result = await client.getExchangeData('test-123', 'claim')
      expect(result).toEqual(exchange)
    })

    it('should return default exchange when not found', async () => {
      const defaultExchange = createStorybookExchangeData('claim', {
        exchangeId: 'default',
        workflowId: 'claim'
      })

      const client = new FakeExchangeClient({
        defaultExchange
      })

      const result = await client.getExchangeData('not-found', 'claim')
      expect(result).toEqual(defaultExchange)
    })

    it('should throw error when exchange not found and no default', async () => {
      const client = new FakeExchangeClient()

      await expect(
        client.getExchangeData('not-found', 'claim')
      ).rejects.toThrow('Exchange not found: not-found (workflow: claim)')
    })

    it('should use correct key format for lookup', async () => {
      const exchange1 = createStorybookExchangeData('claim', {
        exchangeId: 'test-1',
        workflowId: 'claim'
      })
      const exchange2 = createStorybookExchangeData('verify', {
        exchangeId: 'test-1',
        workflowId: 'verify'
      })

      const client = new FakeExchangeClient({
        exchanges: {
          'claim:test-1': exchange1,
          'verify:test-1': exchange2
        }
      })

      // Same exchangeId but different workflowId should return different exchange
      const result1 = await client.getExchangeData('test-1', 'claim')
      const result2 = await client.getExchangeData('test-1', 'verify')

      expect(result1).toEqual(exchange1)
      expect(result2).toEqual(exchange2)
    })
  })

  describe('getExchangeState', () => {
    it('should return exchange state from exchanges map', async () => {
      const exchange = createStorybookExchangeData('verify', {
        exchangeId: 'test-456',
        workflowId: 'verify',
        state: 'complete'
      })

      const client = new FakeExchangeClient({
        exchanges: {
          'verify:test-456': exchange
        }
      })

      const result = await client.getExchangeState('test-456', 'verify')
      expect(result).toEqual(exchange)
      expect(result.state).toBe('complete')
    })
  })

  describe('addExchange', () => {
    it('should add exchange to client', async () => {
      const client = new FakeExchangeClient()
      const exchange = createStorybookExchangeData('claim', {
        exchangeId: 'new-exchange',
        workflowId: 'claim'
      })

      client.addExchange(exchange)

      const result = await client.getExchangeData('new-exchange', 'claim')
      expect(result).toEqual(exchange)
    })
  })

  describe('addExchanges', () => {
    it('should add multiple exchanges to client', async () => {
      const client = new FakeExchangeClient()
      const exchange1 = createStorybookExchangeData('claim', {
        exchangeId: 'test-1',
        workflowId: 'claim'
      })
      const exchange2 = createStorybookExchangeData('verify', {
        exchangeId: 'test-2',
        workflowId: 'verify'
      })

      client.addExchanges({
        'test-1': exchange1,
        'test-2': exchange2
      })

      const result1 = await client.getExchangeData('test-1', 'claim')
      const result2 = await client.getExchangeData('test-2', 'verify')

      expect(result1).toEqual(exchange1)
      expect(result2).toEqual(exchange2)
    })
  })

  describe('createFakeExchangeClient', () => {
    it('should create client with helper function', () => {
      const exchange = createStorybookExchangeData('claim', {
        exchangeId: 'test',
        workflowId: 'claim'
      })

      const client = createFakeExchangeClient({
        exchanges: {
          'claim:test': exchange
        }
      })

      expect(client).toBeInstanceOf(FakeExchangeClient)
    })

    it('should create empty client with helper function', () => {
      const client = createFakeExchangeClient()
      expect(client).toBeInstanceOf(FakeExchangeClient)
    })
  })
})
