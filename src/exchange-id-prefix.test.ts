/**
 * End-to-end tests for `exchangeIdPrefix`.
 *
 * The prefix was chosen over correlation fields that already existed
 * (`variables.retrievalId`, `variables.metadata`) for exactly one reason: it
 * lands in the `exchangeId`, and the `exchangeId` is the only value that
 * appears on *every* observation channel at once. So the load-bearing
 * assertions here are the ones about URLs — `iu`, `OID4VCI`, `OID4VP` — not the
 * one about the minted id. That property breaks silently the moment a URL is
 * rebuilt from something other than `exchange.exchangeId`, which is precisely
 * the regression these tests exist to catch.
 *
 * See `docs/adr/2026-08-11-exchange-id-prefix.md`.
 */
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import testVC from './test-fixtures/testVC.js'

const exchangeHost = 'http://localhost:4005'

beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    statusService: '',
    tenantAuthenticationEnabled: false
  }))
})

afterAll(() => {
  vi.restoreAllMocks()
})

type Protocols = {
  iu: string
  vcapi: string
  OID4VCI?: string
  OID4VP?: string
}

const createExchange = async (
  workflowId: 'claim' | 'verify',
  body: Record<string, unknown>
) =>
  app.request(`/workflows/${workflowId}/exchanges`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })

const claimBody = (exchangeIdPrefix?: string) => ({
  ...(exchangeIdPrefix !== undefined ? { exchangeIdPrefix } : {}),
  variables: {
    tenantName: 'default',
    exchangeHost,
    retrievalId: 'prefix-retrieval-1',
    vc: JSON.stringify(testVC)
  }
})

const verifyBody = (exchangeIdPrefix?: string) => ({
  ...(exchangeIdPrefix !== undefined ? { exchangeIdPrefix } : {}),
  variables: {
    tenantName: 'default',
    exchangeHost,
    vprContext: ['https://www.w3.org/2018/credentials/v1'],
    vprCredentialType: ['VerifiableCredential'],
    vprClaims: []
  }
})

/** The exchange id as it appears in the interaction URL the wallet is given. */
const exchangeIdFrom = (protocols: Protocols) =>
  new URL(protocols.iu).pathname.split('/').pop()!

describe('exchangeIdPrefix · the id itself', () => {
  test('a prefixed create mints `<prefix>-<uuid>`', async () => {
    const response = await createExchange('claim', claimBody('p1'))
    expect(response.status).toBe(200)
    const exchangeId = exchangeIdFrom((await response.json()) as Protocols)

    expect(exchangeId.startsWith('p1-')).toBe(true)
    expect(exchangeId.slice('p1-'.length)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  test('an absent prefix mints a bare UUID — no change for existing callers', async () => {
    const response = await createExchange('claim', claimBody())
    const exchangeId = exchangeIdFrom((await response.json()) as Protocols)

    expect(exchangeId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })

  test('accepts the full 32-character allowance', async () => {
    const prefix = 'a'.repeat(32)
    const response = await createExchange('claim', claimBody(prefix))
    expect(response.status).toBe(200)
    expect(
      exchangeIdFrom((await response.json()) as Protocols).startsWith(
        `${prefix}-`
      )
    ).toBe(true)
  })
})

describe('exchangeIdPrefix · reaching the wire', () => {
  test('a claim exchange carries the prefix in `iu` and `OID4VCI`', async () => {
    const created = await createExchange('claim', claimBody('p1'))
    const protocols = (await created.json()) as Protocols
    const exchangeId = exchangeIdFrom(protocols)

    expect(protocols.iu).toContain('/interactions/p1-')
    expect(decodeURIComponent(protocols.OID4VCI!)).toContain(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
    )
    expect(decodeURIComponent(protocols.OID4VCI!)).toContain('p1-')
  })

  test('a verify exchange carries the prefix in `iu` and `OID4VP`', async () => {
    const created = await createExchange('verify', verifyBody('p2'))
    expect(created.status).toBe(200)
    const protocols = (await created.json()) as Protocols
    const exchangeId = exchangeIdFrom(protocols)

    expect(protocols.iu).toContain('/interactions/p2-')
    // Both the `client_id` (a `redirect_uri:` prefix over the response URI) and
    // the `request_uri` are built per-exchange, so both must carry it.
    expect(decodeURIComponent(protocols.OID4VP!)).toContain(
      `/workflows/verify/exchanges/${exchangeId}/openid4vp/response`
    )
    expect(decodeURIComponent(protocols.OID4VP!)).toContain(
      `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
    )
  })

  test('`GET .../protocols` re-serves the same prefixed URLs after the round trip', async () => {
    const created = await createExchange('claim', claimBody('p3'))
    const exchangeId = exchangeIdFrom((await created.json()) as Protocols)

    const response = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/protocols`
    )
    expect(response.status).toBe(200)
    const { protocols } = (await response.json()) as { protocols: Protocols }

    expect(protocols.iu).toBe(
      `${exchangeHost}/interactions/${exchangeId}?iuv=1`
    )
    expect(protocols.vcapi).toBe(
      `${exchangeHost}/workflows/claim/exchanges/${exchangeId}`
    )
    expect(decodeURIComponent(protocols.OID4VCI!)).toContain(exchangeId)
  })

  test('a prefixed id resolves on `GET` exchange detail — no route validates it as a UUID', async () => {
    const created = await createExchange('claim', claimBody('p4'))
    const exchangeId = exchangeIdFrom((await created.json()) as Protocols)

    const response = await app.request(
      `/workflows/claim/exchanges/${exchangeId}`
    )
    expect(response.status).toBe(200)
    const exchange = (await response.json()) as App.ExchangeDetailBase
    expect(exchange.exchangeId).toBe(exchangeId)
    expect(exchange.exchangeIdPrefix).toBe('p4')
  })
})

describe('exchangeIdPrefix · validation is the service’s job', () => {
  // The value enters 16 route paths and a Keyv key, so a rejection has to be a
  // 400 the caller can act on, never a 500 from somewhere downstream.
  const rejected: Array<[string, unknown]> = [
    ['a path separator', 'p1/etc'],
    ['a dot segment', '..'],
    ['a dot', 'p1.2'],
    ['a query separator', 'p1?x=1'],
    ['whitespace', 'p 1'],
    ['a percent escape', 'p1%2F'],
    ['over 32 characters', 'a'.repeat(33)],
    ['an empty string', ''],
    ['a non-string', 42]
  ]

  test.each(rejected)('rejects %s with 400, not 500', async (_label, value) => {
    const response = await createExchange('claim', {
      ...claimBody(),
      exchangeIdPrefix: value
    })

    expect(response.status).toBe(400)
    const body = (await response.json()) as App.ErrorResponseBody
    expect(body.code).toBe(400)
    expect(body.details).toBeDefined()
  })

  test('the rejection names the field and the rule', async () => {
    const response = await createExchange('claim', {
      ...claimBody(),
      exchangeIdPrefix: 'p1/etc'
    })
    const body = (await response.json()) as App.ErrorResponseBody
    expect(body.message).toContain('exchangeIdPrefix')
    expect(body.message).toContain('1-32')
  })

  test('validation applies on the didAuth workflow too, which has no schema of its own', async () => {
    const response = await app.request('/workflows/didAuth/exchanges', {
      method: 'POST',
      body: JSON.stringify({
        exchangeIdPrefix: '../../etc',
        variables: { tenantName: 'default', exchangeHost }
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    expect(response.status).toBe(400)
  })
})
