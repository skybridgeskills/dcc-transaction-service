import { expect, test, describe, vi, beforeAll, afterAll } from 'vitest'
import { app } from './hono.js'
import { prefersHtml } from './interactions.js'
import * as transactionManager from './transactionManager.js'

describe('prefersHtml', () => {
  test('returns false for undefined (missing Accept header)', () => {
    expect(prefersHtml(undefined)).toBe(false)
  })

  test('returns false for application/json', () => {
    expect(prefersHtml('application/json')).toBe(false)
  })

  test('returns true for text/html', () => {
    expect(prefersHtml('text/html')).toBe(true)
  })

  test('returns true for browser-style Accept header', () => {
    expect(
      prefersHtml(
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      )
    ).toBe(true)
  })

  test('returns true for */* without application/json', () => {
    expect(prefersHtml('*/*')).toBe(true)
  })

  test('returns false for */* with application/json', () => {
    expect(prefersHtml('application/json, */*')).toBe(false)
  })

  test('returns false for empty string', () => {
    expect(prefersHtml('')).toBe(false)
  })
})

describe('GET /interactions/:exchangeId', () => {
  const mockExchange: App.ExchangeDetailDidAuth = {
    tenantName: 'test',
    workflowId: 'didAuth',
    exchangeId: 'test-interaction-id',
    expires: new Date(Date.now() + 600000).toISOString(),
    state: 'pending',
    variables: {
      exchangeHost: 'http://localhost:4005',
      challenge: 'test-challenge'
    }
  }

  beforeAll(async () => {
    await transactionManager.saveExchange(mockExchange)
  })

  test('returns JSON protocols when Accept is application/json', async () => {
    const response = await app.request(
      '/interactions/test-interaction-id?iuv=1',
      {
        headers: { Accept: 'application/json' }
      }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('json')
    const body = await response.json()
    expect(body).toHaveProperty('protocols')
  })

  test('returns JSON when no Accept header', async () => {
    const response = await app.request(
      '/interactions/test-interaction-id?iuv=1'
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('json')
    const body = await response.json()
    expect(body).toHaveProperty('protocols')
  })

  test('returns HTML when Accept is text/html', async () => {
    const response = await app.request(
      '/interactions/test-interaction-id?iuv=1',
      {
        headers: { Accept: 'text/html' }
      }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    const body = await response.text()
    expect(body).toContain('<div id="root">')
  })

  test('returns HTML for browser-style Accept header', async () => {
    const response = await app.request(
      '/interactions/test-interaction-id?iuv=1',
      {
        headers: {
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      }
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  test('returns 404 for unknown exchangeId with JSON accept', async () => {
    const response = await app.request(
      '/interactions/nonexistent-id?iuv=1',
      {
        headers: { Accept: 'application/json' }
      }
    )
    expect(response.status).toBe(404)
  })
})
