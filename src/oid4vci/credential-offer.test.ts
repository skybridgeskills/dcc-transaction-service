import { describe, expect, test } from 'vitest'
import { ensurePreAuthorizedCode } from './state.js'
import {
  buildCredentialOffer,
  credentialIssuerUrlForExchange,
  credentialOfferUriForExchange,
  deriveCredentialConfigurationId
} from './credential-offer.js'
import { credentialOfferSchema, PRE_AUTHORIZED_GRANT } from './schemas.js'

const fixture = (
  vc: string = '{"type":["VerifiableCredential","OpenBadgeCredential"]}'
): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc
  }
})

describe('deriveCredentialConfigurationId', () => {
  test('returns the first non-base type', () => {
    expect(
      deriveCredentialConfigurationId(
        '{"type":["VerifiableCredential","OpenBadgeCredential"]}'
      )
    ).toBe('OpenBadgeCredential')
  })

  test('handles a single string type', () => {
    expect(
      deriveCredentialConfigurationId('{"type":"OpenBadgeCredential"}')
    ).toBe('OpenBadgeCredential')
  })

  test('falls back to VerifiableCredential when nothing else is present', () => {
    expect(deriveCredentialConfigurationId('{"type":"VerifiableCredential"}')).toBe(
      'VerifiableCredential'
    )
  })

  test('falls back to VerifiableCredential for invalid JSON', () => {
    expect(deriveCredentialConfigurationId('{not json')).toBe(
      'VerifiableCredential'
    )
  })
})

describe('URL helpers', () => {
  test('credential issuer URL is per-exchange', () => {
    expect(credentialIssuerUrlForExchange(fixture())).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123'
    )
  })

  test('credential offer URI hangs off the issuer URL', () => {
    expect(credentialOfferUriForExchange(fixture())).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123/openid/credential-offer'
    )
  })
})

describe('buildCredentialOffer', () => {
  test('builds a spec-shaped offer for a primed exchange', () => {
    const { exchange, code } = ensurePreAuthorizedCode(fixture(), 600)
    const offer = buildCredentialOffer(exchange)

    // Round-trip through the wire schema as the strongest shape check.
    const parsed = credentialOfferSchema.parse(offer)
    expect(parsed.credential_issuer).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123'
    )
    expect(parsed.credential_configuration_ids).toEqual(['OpenBadgeCredential'])
    expect(parsed.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']).toBe(code)
  })

  test('throws if no pre-authorized code is present', () => {
    expect(() => buildCredentialOffer(fixture())).toThrow(
      /ensurePreAuthorizedCode/
    )
  })
})
