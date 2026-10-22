/**
 * `deriveDomain` / `expectedDomain`: the one resolver every VPR builder and
 * every verification path reads the `domain` through.
 */
import { describe, expect, test } from 'vitest'
import { deriveDomain, expectedDomain } from './vpr-wire.js'

const HOST = 'https://exchange.example'

const exchange = (
  workflowId: string,
  variables: Record<string, unknown> = {}
) =>
  ({
    exchangeId: 'ex-1',
    workflowId,
    tenantName: 'default',
    variables: { exchangeHost: HOST, challenge: 'c', ...variables }
  }) as unknown as App.ExchangeDetailBase

describe('deriveDomain', () => {
  test('claim and didAuth derive the bare exchange host', () => {
    expect(deriveDomain(exchange('claim'))).toBe(HOST)
    expect(deriveDomain(exchange('didAuth'))).toBe(HOST)
  })

  test('verify derives the per-exchange service endpoint', () => {
    expect(deriveDomain(exchange('verify'))).toBe(
      `${HOST}/workflows/verify/exchanges/ex-1`
    )
  })

  test("the exchange's profile decides the form", () => {
    expect(
      deriveDomain(
        exchange('verify', { protocolProfileName: 'vcapi-vpr-bare-origin-domain' })
      )
    ).toBe(HOST)
  })
})

describe('expectedDomain', () => {
  test('the stamp wins over the derivation', () => {
    expect(
      expectedDomain(exchange('verify', { domain: 'https://stamped.example' }))
    ).toBe('https://stamped.example')
  })

  /**
   * ⚠️ Exchanges created before the stamp existed: derived exactly as the VPR
   * builders always derived it, so a wallet that signed what it was sent before
   * the deploy still verifies after it.
   */
  test('an unstamped exchange derives the domain', () => {
    expect(expectedDomain(exchange('verify'))).toBe(
      `${HOST}/workflows/verify/exchanges/ex-1`
    )
    expect(expectedDomain(exchange('didAuth'))).toBe(HOST)
  })
})
