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
