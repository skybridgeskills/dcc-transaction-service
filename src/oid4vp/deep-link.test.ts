import { describe, expect, test } from 'vitest'
import { buildOid4vpDeepLink, buildOid4vpDeepLinkByValue } from './deep-link.js'
import { buildAuthorizationRequest } from './authorization-request.js'
import { ensureOid4vpState } from './state.js'
import { authorizationRequestSchema } from './schemas.js'

describe('buildOid4vpDeepLink', () => {
  const clientId =
    'redirect_uri:https://verifier.example/workflows/verify/exchanges/e1/openid4vp/response'
  const requestUri =
    'https://verifier.example/workflows/verify/exchanges/e1/openid4vp/request'

  test('uses the openid4vp:// scheme with client_id + request_uri params', () => {
    const link = buildOid4vpDeepLink({ clientId, requestUri })
    expect(link.startsWith('openid4vp://?')).toBe(true)
    expect(link).toContain(`client_id=${encodeURIComponent(clientId)}`)
    expect(link).toContain(`request_uri=${encodeURIComponent(requestUri)}`)
  })

  test('round-trips the encoded params back to their originals', () => {
    const link = buildOid4vpDeepLink({ clientId, requestUri })
    const url = new URL(link)
    expect(url.searchParams.get('client_id')).toBe(clientId)
    expect(url.searchParams.get('request_uri')).toBe(requestUri)
  })
})

describe('buildOid4vpDeepLinkByValue', () => {
  const fixture = (
    overrides: Partial<App.ExchangeDetailVerify['variables']> = {}
  ): App.ExchangeDetailVerify =>
    ensureOid4vpState({
      tenantName: 'default',
      workflowId: 'verify',
      exchangeId: 'exch-123',
      expires: new Date(Date.now() + 60_000).toISOString(),
      state: 'pending',
      variables: {
        challenge: 'chal-xyz',
        exchangeHost: 'https://verifier.example',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
        trustedIssuers: [],
        trustedRegistries: [],
        vprClaims: [],
        ...overrides
      }
    }).exchange

  /**
   * Parse a by-value link back to the object a wallet would reconstruct:
   * strings stay strings, JSON-valued params are re-parsed.
   */
  const parseByValue = (link: string) => {
    const url = new URL(link)
    const out: Record<string, unknown> = {}
    for (const [key, value] of url.searchParams) {
      out[key] =
        value.startsWith('{') || value.startsWith('[')
          ? JSON.parse(value)
          : value
    }
    return out
  }

  test('carries NO request_uri — that is the whole point of the arm', () => {
    const link = buildOid4vpDeepLinkByValue(
      buildAuthorizationRequest(fixture())
    )
    expect(link.startsWith('openid4vp://?')).toBe(true)
    expect(new URL(link).searchParams.has('request_uri')).toBe(false)
  })

  /*
  The conformance claim this arm exists to make: a `redirect_uri` client_id
  cannot be passed by reference under ANY published OID4VP version (§5.9.3
  forbids signing it; §5.10.1 / RFC 9101 require a signed JWT at request_uri).
  So the wallet must be able to reconstruct the complete request from the URL
  alone, with nothing left to fetch.
  */
  test('round-trips to a request identical to the served one, DCQL arm', () => {
    const request = buildAuthorizationRequest(fixture())
    const parsed = parseByValue(buildOid4vpDeepLinkByValue(request))
    expect(parsed).toEqual(request)
    expect(() => authorizationRequestSchema.parse(parsed)).not.toThrow()
  })

  test('round-trips the PEX arm too, presentation_definition intact', () => {
    const request = buildAuthorizationRequest(
      fixture({ oid4vpQueryLanguage: 'pex' })
    )
    const parsed = parseByValue(buildOid4vpDeepLinkByValue(request))
    expect(parsed).toEqual(request)
    expect(parsed.presentation_definition).toBeTruthy()
    expect(parsed.dcql_query).toBeUndefined()
  })

  test('nested objects survive as objects, not "[object Object]"', () => {
    const request = buildAuthorizationRequest(fixture())
    const parsed = parseByValue(buildOid4vpDeepLinkByValue(request))
    expect(parsed.client_metadata).toEqual(request.client_metadata)
    expect(typeof parsed.client_metadata).toBe('object')
  })

  test('binds the response: state and nonce ride in the URL', () => {
    const exchange = fixture()
    const link = buildOid4vpDeepLinkByValue(buildAuthorizationRequest(exchange))
    const params = new URL(link).searchParams
    // Without `state` in the URL the wallet cannot echo it, and
    // `consumeOid4vpResponse` rejects every response as `state-mismatch`.
    expect(params.get('state')).toBe(exchange.variables.oid4vp!.state)
    expect(params.get('nonce')).toBe('chal-xyz')
  })

  /*
  Not a spec limit — a physical one. A wallet need not register a URL scheme
  at all, and for such a wallet this string is delivered as a QR code and
  nothing else. Pinning the rough size keeps `qrSizeFor` honest: if a future
  request parameter pushes this past the densest symbol we render legibly,
  this test is where it is noticed, not with a device in hand.
  */
  test('PEX payload stays inside the QR budget it is scanned from', () => {
    const link = buildOid4vpDeepLinkByValue(
      buildAuthorizationRequest(fixture({ oid4vpQueryLanguage: 'pex' }))
    )
    expect(link.length).toBeGreaterThan(900)
    expect(link.length).toBeLessThan(2000)
  })
})
