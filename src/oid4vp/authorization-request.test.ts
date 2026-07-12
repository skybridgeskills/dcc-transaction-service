import { describe, expect, test } from 'vitest'
import {
  buildAuthorizationRequest,
  clientIdForExchange,
  requestUriForExchange,
  responseUriForExchange,
  verifierUrlForExchange
} from './authorization-request.js'
import { ensureOid4vpState } from './state.js'
import { VC_TYPE_IRI, authorizationRequestSchema } from './schemas.js'

const fixture = (
  overrides: Partial<App.ExchangeDetailVerify['variables']> = {}
): App.ExchangeDetailVerify => ({
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
})

/** Exchange with a minted `state`, ready for `buildAuthorizationRequest`. */
const withState = (
  overrides: Partial<App.ExchangeDetailVerify['variables']> = {}
): App.ExchangeDetailVerify => ensureOid4vpState(fixture(overrides)).exchange

describe('OID4VP · URL helpers', () => {
  test('verifierUrlForExchange builds the per-exchange base', () => {
    expect(verifierUrlForExchange(fixture())).toBe(
      'https://verifier.example/workflows/verify/exchanges/exch-123'
    )
  })

  test('response and request URIs hang off /openid4vp', () => {
    expect(responseUriForExchange(fixture())).toBe(
      'https://verifier.example/workflows/verify/exchanges/exch-123/openid4vp/response'
    )
    expect(requestUriForExchange(fixture())).toBe(
      'https://verifier.example/workflows/verify/exchanges/exch-123/openid4vp/request'
    )
  })

  test('clientId uses the redirect_uri prefix pointing at the response URI', () => {
    expect(clientIdForExchange(fixture())).toBe(
      'redirect_uri:https://verifier.example/workflows/verify/exchanges/exch-123/openid4vp/response'
    )
  })
})

describe('buildAuthorizationRequest', () => {
  test('produces a schema-valid unsigned request (empty vprClaims)', () => {
    const req = buildAuthorizationRequest(withState())
    expect(() => authorizationRequestSchema.parse(req)).not.toThrow()
    expect(req.response_type).toBe('vp_token')
    expect(req.response_mode).toBe('direct_post')
    expect(req.client_id).toBe(
      'redirect_uri:https://verifier.example/workflows/verify/exchanges/exch-123/openid4vp/response'
    )
    expect(req.response_uri).toBe(
      'https://verifier.example/workflows/verify/exchanges/exch-123/openid4vp/response'
    )
    expect(req.nonce).toBe('chal-xyz')
    expect(req.state).toBeTruthy()
    expect(req.dcql_query.credentials[0].meta.type_values).toEqual([
      [VC_TYPE_IRI]
    ])
    expect(req.dcql_query.credentials[0].claims).toBeUndefined()
  })

  test('derives dcql claims from vprClaims', () => {
    const req = buildAuthorizationRequest(
      withState({
        vprClaims: [{ path: ['credentialSubject', 'achievement', 'name'] }]
      })
    )
    expect(req.dcql_query.credentials[0].claims).toEqual([
      { path: ['credentialSubject', 'achievement', 'name'] }
    ])
  })

  test('advertises DataIntegrityProof + rdfc cryptosuites for ldp_vc and ldp_vp', () => {
    const req = buildAuthorizationRequest(withState())
    const formats = req.client_metadata.vp_formats_supported
    for (const fmt of ['ldp_vc', 'ldp_vp'] as const) {
      expect(formats[fmt]?.proof_type_values).toEqual(['DataIntegrityProof'])
      expect(formats[fmt]?.cryptosuite_values).toContain('ecdsa-rdfc-2019')
      expect(formats[fmt]?.cryptosuite_values).toContain('eddsa-rdfc-2022')
      expect(formats[fmt]?.cryptosuite_values).not.toContain(
        'ed25519-signature-2020'
      )
    }
  })

  test('reuses the exchange challenge as nonce (does not mint a second nonce)', () => {
    const req = buildAuthorizationRequest(withState({ challenge: 'reused-1' }))
    expect(req.nonce).toBe('reused-1')
  })
})
