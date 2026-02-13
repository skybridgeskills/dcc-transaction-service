import { describe, it, expect } from 'vitest'
import { getExchangeProtocols } from './exchange-utils.js'
import { createStorybookExchangeData } from '../test-fixtures/storybook-exchange-data.js'

describe('getExchangeProtocols', () => {
  it('should extract protocols for claim exchange', () => {
    const exchange = createStorybookExchangeData('claim', {
      exchangeId: 'test-claim-123',
      variables: {
        exchangeHost: 'https://example.com'
      }
    })

    const protocols = getExchangeProtocols(exchange)

    expect(protocols.iu).toBe(
      'https://example.com/interactions/test-claim-123?iuv=1'
    )
    expect(protocols.vcapi).toBeTruthy()
    expect(protocols.lcw).toBeTruthy()
    expect(protocols.OID4VCI).toBeTruthy()
    expect(protocols.verifiablePresentationRequest).toBeTruthy()
    expect(protocols.verifiablePresentationRequest.challenge).toBe(
      exchange.variables.challenge
    )
  })

  it('should extract protocols for didAuth exchange', () => {
    const exchange = createStorybookExchangeData('didAuth', {
      exchangeId: 'test-didauth-123',
      variables: {
        exchangeHost: 'https://example.com'
      }
    })

    const protocols = getExchangeProtocols(exchange)

    expect(protocols.iu).toBe(
      'https://example.com/interactions/test-didauth-123?iuv=1'
    )
    expect(protocols.vcapi).toBeTruthy()
    expect(protocols.lcw).toBeTruthy()
    expect(protocols.OID4VCI).toBeUndefined() // Only for claim exchanges
    expect(protocols.verifiablePresentationRequest).toBeTruthy()
    expect(protocols.verifiablePresentationRequest.challenge).toBe(
      exchange.variables.challenge
    )
  })

  it('should extract protocols for verify exchange', () => {
    const exchange = createStorybookExchangeData('verify', {
      exchangeId: 'test-verify-123',
      variables: {
        exchangeHost: 'https://example.com',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential'],
        trustedIssuers: [],
        vprClaims: []
      }
    })

    const protocols = getExchangeProtocols(exchange)

    expect(protocols.iu).toBe(
      'https://example.com/interactions/test-verify-123?iuv=1'
    )
    expect(protocols.vcapi).toBeTruthy()
    expect(protocols.lcw).toBeTruthy()
    expect(protocols.OID4VCI).toBeUndefined() // Only for claim exchanges
    expect(protocols.verifiablePresentationRequest).toBeTruthy()
    expect(protocols.verifiablePresentationRequest.query).toBeTruthy()
  })

  it('should include OID4VCI deep link for claim exchanges', () => {
    const exchange = createStorybookExchangeData('claim', {
      exchangeId: 'test-claim-456',
      variables: {
        exchangeHost: 'https://example.com'
      }
    })

    const protocols = getExchangeProtocols(exchange)

    expect(protocols.OID4VCI).toBeTruthy()
    expect(protocols.OID4VCI).toContain('openid-credential-offer://')
    expect(protocols.OID4VCI).toContain('credential_offer_uri=')
    expect(protocols.OID4VCI).toContain(
      encodeURIComponent(
        'https://example.com/workflows/claim/exchanges/test-claim-456/openid/credential-offer'
      )
    )
  })

  it('should construct interactions URL correctly', () => {
    const exchange = createStorybookExchangeData('didAuth', {
      exchangeId: 'test-exchange-789',
      variables: {
        exchangeHost: 'http://localhost:4005'
      }
    })

    const protocols = getExchangeProtocols(exchange)

    expect(protocols.iu).toBe(
      'http://localhost:4005/interactions/test-exchange-789?iuv=1'
    )
  })
})
