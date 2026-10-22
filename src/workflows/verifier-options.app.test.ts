/**
 * `variables.options` through the route that creates the exchange.
 *
 * ⚠️ `verbose` was removed with verifier-core 2.0, which always returns every
 * check that ran. A caller still sending it is refused with 400 — the options
 * schema is `.strict()` — rather than silently accepted as a no-op, so the
 * caller learns the knob is gone instead of believing it took effect.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'

beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    tenantAuthenticationEnabled: false
  }))
})

afterAll(() => {
  vi.restoreAllMocks()
})

const createVerify = async (options: Record<string, unknown>) =>
  app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: 'http://localhost:4005',
        tenantName: 'default',
        vprContext: [],
        vprCredentialType: ['OpenBadgeCredential'],
        vprClaims: [],
        options
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })

describe('POST /workflows/verify/exchanges · variables.options', () => {
  test('options.verbose is refused with 400', async () => {
    const response = await createVerify({ verbose: true })
    expect(response.status).toBe(400)
  })

  test('options.timing is still accepted', async () => {
    const response = await createVerify({ timing: true })
    expect(response.status).toBe(200)
  })
})
