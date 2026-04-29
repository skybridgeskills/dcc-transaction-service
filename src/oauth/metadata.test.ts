import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { app } from '../hono.js'
import * as config from '../config.js'

describe('GET /.well-known/oauth-authorization-server', () => {
  beforeEach(() => {
    const base = config.getConfig()
    vi.spyOn(config, 'getConfig').mockImplementation(() => ({
      ...base,
      defaultExchangeHost: 'https://example.test'
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns RFC 8414 metadata with token_endpoint', async () => {
    const res = await app.request('/.well-known/oauth-authorization-server')
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      issuer: string
      token_endpoint: string
      grant_types_supported: string[]
    }
    expect(body.issuer).toBe('https://example.test')
    expect(body.token_endpoint).toBe('https://example.test/oauth/token')
    expect(body.grant_types_supported).toEqual(['client_credentials'])
  })
})
