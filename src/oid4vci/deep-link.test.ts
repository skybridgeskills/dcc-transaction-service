import { describe, expect, test } from 'vitest'
import {
  buildOpenIdCredentialOfferDeepLinkByReference,
  buildOpenIdCredentialOfferDeepLinkByValue
} from './deep-link.js'

describe('buildOpenIdCredentialOfferDeepLinkByReference', () => {
  test('builds the canonical deep link with a percent-encoded URI', () => {
    const link = buildOpenIdCredentialOfferDeepLinkByReference(
      'https://issuer.example/workflows/claim/exchanges/abc-123/openid/credential-offer'
    )
    expect(link).toBe(
      'openid-credential-offer://?credential_offer_uri=https%3A%2F%2Fissuer.example%2Fworkflows%2Fclaim%2Fexchanges%2Fabc-123%2Fopenid%2Fcredential-offer'
    )
  })

  test('round-trips: decoding the parameter yields the original URI', () => {
    const uri = 'https://issuer.example/path?with=query&and=more'
    const link = buildOpenIdCredentialOfferDeepLinkByReference(uri)
    const url = new URL(link.replace('openid-credential-offer://', 'http://x/'))
    expect(url.searchParams.get('credential_offer_uri')).toBe(uri)
  })
})

describe('buildOpenIdCredentialOfferDeepLinkByValue', () => {
  test('encodes the offer JSON in the URL', () => {
    const offer = { credential_issuer: 'https://issuer.example' }
    const link = buildOpenIdCredentialOfferDeepLinkByValue(offer)
    expect(link.startsWith('openid-credential-offer://?credential_offer=')).toBe(
      true
    )
    const url = new URL(link.replace('openid-credential-offer://', 'http://x/'))
    expect(JSON.parse(url.searchParams.get('credential_offer')!)).toEqual(offer)
  })
})
