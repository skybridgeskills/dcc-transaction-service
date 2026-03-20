import { describe, expect, test, vi, beforeEach, afterEach } from 'vitest'
import { app } from '../hono.js'
import * as config from '../config.js'

describe('POST /oauth/token', () => {
  const accessSecret = 'test-only-access-jwt-secret-min-32-characters-long!!'

  beforeEach(() => {
    const base = config.getConfig()
    vi.spyOn(config, 'getConfig').mockImplementation(() => ({
      ...base,
      accessJwtSecret: accessSecret,
      tenantAuthenticationEnabled: true,
      tenants: {
        tenant1: {
          tenantName: 'tenant1',
          tenantToken: 'tenant1-secret'
        }
      }
    }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  test('returns access_token for valid client_credentials', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'tenant1',
        client_secret: 'tenant1-secret'
      }).toString()
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      access_token: string
      token_type: string
      expires_in: number
    }
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBe(3600)
    expect(typeof body.access_token).toBe('string')
    expect(body.access_token.length).toBeGreaterThan(10)
  })

  test('401 invalid_client for wrong secret', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'tenant1',
        client_secret: 'wrong'
      }).toString()
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('invalid_client')
  })

  test('400 for unsupported grant_type', async () => {
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: 'tenant1',
        client_secret: 'tenant1-secret'
      }).toString()
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toBe('unsupported_grant_type')
  })

  test('503 when ACCESS_JWT_SECRET not configured', async () => {
    const base = config.getConfig()
    vi.spyOn(config, 'getConfig').mockImplementation(() => ({
      ...base,
      accessJwtSecret: '',
      tenantAuthenticationEnabled: true,
      tenants: {
        tenant1: {
          tenantName: 'tenant1',
          tenantToken: 'tenant1-secret'
        }
      }
    }))
    const res = await app.request('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: 'tenant1',
        client_secret: 'tenant1-secret'
      }).toString()
    })
    expect(res.status).toBe(503)
  })
})
