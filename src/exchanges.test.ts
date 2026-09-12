import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import { getProtocols } from './exchanges.js'
import { createMockExchange } from './test-fixtures/testData.js'
import testVC from './test-fixtures/testVC.js'

const exchangeHost = 'http://localhost:4004'

const baseVariables = {
  exchangeHost,
  tenantName: 'default',
  challenge: 'test-challenge',
  features: { details: true }
}

describe('getProtocols', () => {
  test('claim exchange iu includes ?iuv=1 and other protocol fields', () => {
    const exchange: App.ExchangeDetailClaim = {
      workflowId: 'claim',
      exchangeId: 'test-claim-123',
      tenantName: 'default',
      expires: new Date(Date.now() + 600_000).toISOString(),
      state: 'pending',
      variables: {
        ...baseVariables,
        retrievalId: 'ret-1',
        vc: JSON.stringify(testVC)
      }
    }

    const protocols = getProtocols(exchange)

    expect(protocols.iu).toBe(
      `${exchangeHost}/interactions/test-claim-123?iuv=1`
    )
    expect(protocols.vcapi).toBe(
      `${exchangeHost}/workflows/claim/exchanges/test-claim-123`
    )
    expect(protocols.lcw).toBeDefined()
    expect(protocols.OID4VCI).toMatch(/^openid-credential-offer:\/\//)
  })

  test('didAuth exchange iu includes ?iuv=1', () => {
    const exchange: App.ExchangeDetailDidAuth = {
      workflowId: 'didAuth',
      exchangeId: 'test-didauth-123',
      tenantName: 'default',
      expires: new Date(Date.now() + 600_000).toISOString(),
      state: 'pending',
      variables: baseVariables
    }

    const protocols = getProtocols(exchange)

    expect(protocols.iu).toBe(
      `${exchangeHost}/interactions/test-didauth-123?iuv=1`
    )
    expect(protocols.vcapi).toBe(
      `${exchangeHost}/workflows/didAuth/exchanges/test-didauth-123`
    )
    expect(protocols.lcw).toBeDefined()
    expect(protocols.OID4VCI).toBeUndefined()
  })

  test('verify exchange iu includes ?iuv=1', () => {
    const exchange = createMockExchange({
      exchangeId: 'test-verify-123',
      variables: {
        ...createMockExchange().variables,
        exchangeHost
      }
    })

    const protocols = getProtocols(exchange)

    expect(protocols.iu).toBe(
      `${exchangeHost}/interactions/test-verify-123?iuv=1`
    )
    expect(protocols.vcapi).toBe(
      `${exchangeHost}/workflows/verify/exchanges/test-verify-123`
    )
    expect(protocols.lcw).toBeDefined()
    expect(protocols.OID4VCI).toBeUndefined()
  })

  /*
  The delivery arms. `by-reference` is the default: it is the baseline
  construction every other delivery is compared against. `by-value` is the
  conformant arm under the `redirect_uri` client_id prefix.
  See `oid4vp/deep-link.ts`.
  */
  test('verify OID4VP defaults to the by-reference delivery', () => {
    const exchange = createMockExchange({
      exchangeId: 'test-verify-byref',
      variables: { ...createMockExchange().variables, exchangeHost }
    })

    const protocols = getProtocols(exchange)

    const url = new URL(protocols.OID4VP!)
    expect(url.searchParams.get('request_uri')).toBe(
      `${exchangeHost}/workflows/verify/exchanges/test-verify-byref/openid4vp/request`
    )
    expect(url.searchParams.get('client_id')).toBe(
      `redirect_uri:${exchangeHost}/workflows/verify/exchanges/test-verify-byref/openid4vp/response`
    )
    // Nothing else: by reference is client_id + request_uri and no more.
    expect([...url.searchParams.keys()].sort()).toEqual([
      'client_id',
      'request_uri'
    ])
  })

  test('verify OID4VP by-value inlines the whole request, no request_uri', () => {
    const base = createMockExchange()
    const exchange = createMockExchange({
      exchangeId: 'test-verify-byvalue',
      variables: {
        ...base.variables,
        exchangeHost,
        oid4vpDelivery: 'by-value',
        // `getProtocols` cannot mint or persist; `createExchangeVerify` does
        // it for this arm, so the fixture stands in for that.
        oid4vp: { state: 'st-fixed', responseReceived: false }
      }
    })

    const protocols = getProtocols(exchange)

    const params = new URL(protocols.OID4VP!).searchParams
    expect(params.has('request_uri')).toBe(false)
    expect(params.get('response_type')).toBe('vp_token')
    expect(params.get('response_mode')).toBe('direct_post')
    expect(params.get('state')).toBe('st-fixed')
    expect(params.get('response_uri')).toBe(
      `${exchangeHost}/workflows/verify/exchanges/test-verify-byvalue/openid4vp/response`
    )
    expect(JSON.parse(params.get('client_metadata')!)).toHaveProperty(
      'vp_formats_supported'
    )
  })

  test('by-value without a minted state throws rather than degrading', () => {
    const base = createMockExchange()
    const exchange = createMockExchange({
      exchangeId: 'test-verify-nostate',
      variables: {
        ...base.variables,
        exchangeHost,
        oid4vpDelivery: 'by-value'
      }
    })
    // Silently falling back to by-reference would change a second variable in
    // a comparison meant to change one, and report the wrong answer — the one
    // failure this build exists to prevent.
    expect(() => getProtocols(exchange)).toThrow(/no oid4vp.state/)
  })

  test('preserves a custom exchangeHost on iu', () => {
    const customHost = 'https://issuer.example'
    const exchange: App.ExchangeDetailDidAuth = {
      workflowId: 'didAuth',
      exchangeId: 'test-exchange-789',
      tenantName: 'default',
      expires: new Date(Date.now() + 600_000).toISOString(),
      state: 'pending',
      variables: {
        ...baseVariables,
        exchangeHost: customHost
      }
    }

    const protocols = getProtocols(exchange)

    expect(protocols.iu).toBe(
      `${customHost}/interactions/test-exchange-789?iuv=1`
    )
  })
})

describe('POST /workflows/claim/exchanges', () => {
  beforeAll(() => {
    vi.spyOn(axios, 'post').mockImplementation(() =>
      Promise.resolve({ data: {} })
    )
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

  test('returns iu with ?iuv=1', async () => {
    const response = await app.request('/workflows/claim/exchanges', {
      method: 'POST',
      body: JSON.stringify({
        variables: {
          tenantName: 'default',
          exchangeHost,
          retrievalId: 'lit-retrieval-1',
          vc: JSON.stringify(testVC)
        }
      }),
      headers: { 'Content-Type': 'application/json' }
    })

    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      iu: string
      vcapi: string
      OID4VCI?: string
    }

    const exchangeId = new URL(body.iu).pathname.split('/').pop()
    expect(exchangeId).toBeTruthy()
    expect(body.iu).toBe(`${exchangeHost}/interactions/${exchangeId}?iuv=1`)
    expect(body.vcapi).toBe(
      `${exchangeHost}/workflows/claim/exchanges/${exchangeId}`
    )
    expect(body.OID4VCI).toMatch(/^openid-credential-offer:\/\//)
  })
})
