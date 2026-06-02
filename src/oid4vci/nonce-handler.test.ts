import { describe, expect, test } from 'vitest'
import { handleNonceRequest } from './nonce-handler.js'
import { nonceResponseSchema } from './schemas.js'

const fixture = (): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: '{"type":["VerifiableCredential"]}'
  }
})

describe('handleNonceRequest', () => {
  test('mints a fresh nonce stamped on the exchange', () => {
    const r = handleNonceRequest(fixture())
    const parsed = nonceResponseSchema.parse(r.response)
    expect(parsed.c_nonce).toBe(r.exchange.variables.oid4vci?.cNonce)
    expect(r.exchange.variables.oid4vci?.nonceUsed).toBe(false)
  })

  test('replaces a prior nonce', () => {
    const a = handleNonceRequest(fixture())
    const b = handleNonceRequest(a.exchange)
    expect(b.response.c_nonce).not.toBe(a.response.c_nonce)
    expect(b.exchange.variables.oid4vci?.cNonce).toBe(b.response.c_nonce)
  })
})
