import { describe, expect, test } from 'vitest'
import {
  buildAuthorizationRequest,
  clientIdForExchange,
  requestUriForExchange,
  responseUriForExchange,
  verifierUrlForExchange
} from './authorization-request.js'
import { ensureOid4vpState } from './state.js'
import {
  VC_TYPE_IRI,
  OID4VP_CRYPTOSUITE_VALUES,
  authorizationRequestSchema
} from './schemas.js'
import { buildPresentationDefinition } from './pex.js'

/**
 * Narrow an authorization request to its DCQL arm.
 *
 * `dcql_query` became optional when the PEX arm was added — exactly one of
 * the two is present. Assert the arm the test expects rather than reaching
 * through with `!`, so a request that silently switched language fails here
 * with a clear message instead of a null dereference.
 */
const dcqlOf = (req: { dcql_query?: unknown }) => {
  if (!req.dcql_query) {
    throw new Error('expected a dcql_query arm on the authorization request')
  }
  return req.dcql_query as {
    credentials: [
      { meta: { type_values: string[][] }; claims?: unknown; format: string }
    ]
  }
}


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
    expect(dcqlOf(req).credentials[0].meta.type_values).toEqual([
      [VC_TYPE_IRI]
    ])
    expect(dcqlOf(req).credentials[0].claims).toBeUndefined()
  })

  test('derives dcql claims from vprClaims', () => {
    const req = buildAuthorizationRequest(
      withState({
        vprClaims: [{ path: ['credentialSubject', 'achievement', 'name'] }]
      })
    )
    expect(dcqlOf(req).credentials[0].claims).toEqual([
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

  test('advertises exactly OID4VP_CRYPTOSUITE_VALUES, with nothing able to widen it', () => {
    // ⚠️ There is no widening path to test against: nothing unions a suite this
    // verifier does not accept into the advertised list, so the emitted
    // `cryptosuite_values` for both ldp_vc and ldp_vp deep-equals the truthful
    // capability constant on every exchange and under every profile — this
    // assertion is total rather than a statement about the default.
    const req = buildAuthorizationRequest(withState())
    const formats = req.client_metadata.vp_formats_supported
    for (const fmt of ['ldp_vc', 'ldp_vp'] as const) {
      expect(formats[fmt]?.cryptosuite_values).toEqual(OID4VP_CRYPTOSUITE_VALUES)
      // Never the suite we can verify but deliberately never ask for.
      expect(formats[fmt]?.cryptosuite_values).not.toContain('ecdsa-sd-2023')
    }
  })

  test('reuses the exchange challenge as nonce (does not mint a second nonce)', () => {
    const req = buildAuthorizationRequest(withState({ challenge: 'reused-1' }))
    expect(req.nonce).toBe('reused-1')
  })
})

describe('OID4VP · Presentation Exchange arm', () => {
  const claims = [
    { path: ['credentialSubject', 'achievement', 'name'], values: ['Wonder'] }
  ]

  test('a pex exchange emits presentation_definition and no dcql_query', () => {
    const req = buildAuthorizationRequest(
      withState({ oid4vpQueryLanguage: 'pex', vprClaims: claims })
    )
    expect(req.presentation_definition).toBeDefined()
    expect(req.dcql_query).toBeUndefined()
  })

  test('the default exchange still emits dcql_query and no presentation_definition', () => {
    const req = buildAuthorizationRequest(withState({ vprClaims: claims }))
    expect(req.dcql_query).toBeDefined()
    expect(req.presentation_definition).toBeUndefined()
  })

  test('the format constraint carries proof types, while client_metadata carries the cryptosuites', () => {
    // The two are different vocabularies and the request has to keep them
    // apart: PEX `format.ldp_vc.proof_type` is the credential's `proof.type`,
    // whereas `client_metadata.vp_formats_supported` splits
    // `proof_type_values` from `cryptosuite_values` and is where a cryptosuite
    // name belongs. Asserted together because emitting one in place of the
    // other is exactly the defect this pins (see `pex.ts`).
    const req = buildAuthorizationRequest(
      withState({ oid4vpQueryLanguage: 'pex' })
    )
    const descriptor = req.presentation_definition!.input_descriptors[0]!
    expect(descriptor.format?.ldp_vc?.proof_type).toEqual([
      'DataIntegrityProof',
      'Ed25519Signature2020'
    ])
    expect(req.client_metadata.vp_formats_supported.ldp_vc).toEqual({
      proof_type_values: ['DataIntegrityProof'],
      cryptosuite_values: OID4VP_CRYPTOSUITE_VALUES
    })
  })

  test('threads vprLimitDisclosure into constraints.limit_disclosure', () => {
    // The profile variable flows profile → exchange variables → request
    // builder, the same path vprClaims and oid4vpQueryLanguage take.
    const req = buildAuthorizationRequest(
      withState({
        oid4vpQueryLanguage: 'pex',
        vprClaims: claims,
        vprLimitDisclosure: 'required'
      })
    )
    expect(
      req.presentation_definition!.input_descriptors[0]!.constraints
        .limit_disclosure
    ).toBe('required')
  })

  test('omits limit_disclosure when the exchange does not set it', () => {
    // Default byte-identical behaviour: a pex exchange without the flag emits
    // no `limit_disclosure` member at all.
    const req = buildAuthorizationRequest(
      withState({ oid4vpQueryLanguage: 'pex', vprClaims: claims })
    )
    expect(
      req.presentation_definition!.input_descriptors[0]!.constraints
        .limit_disclosure
    ).toBeUndefined()
    // Prove the whole definition is unchanged versus a direct build with no flag.
    expect(req.presentation_definition).toEqual(
      buildPresentationDefinition({ vprClaims: claims })
    )
  })

  test('schema rejects a request carrying neither arm', () => {
    // ⚠️ **Carrying BOTH arms is accepted; carrying NEITHER is not.** The
    // asymmetry is deliberate.
    //
    // A request carrying both leaves the wallet to choose, which makes the
    // response ambiguous to us — and that is why every single-language arm
    // stays single-language. The ambiguity is accepted on one arm only, as a
    // registered accommodation, because some clients resolve a request
    // carrying both and do not resolve a single-language one: an ambiguous
    // response we can read beats no response at all.
    //
    // A request carrying NEITHER asks for nothing, and nothing about the
    // accommodation makes that reasonable. It is refused.
    const base = buildAuthorizationRequest(withState({ vprClaims: claims }))
    const { dcql_query: _omitted, ...neither } = base

    expect(() => authorizationRequestSchema.parse(neither)).toThrow()
  })

  test('schema accepts both arms together — the accommodation, and only there', () => {
    const base = buildAuthorizationRequest(withState({ vprClaims: claims }))

    expect(() =>
      authorizationRequestSchema.parse({
        ...base,
        presentation_definition: buildPresentationDefinition({
          vprClaims: claims
        })
      })
    ).not.toThrow()
  })

  test('an exchange with no profile still emits exactly one query language', () => {
    // The guard that keeps the relaxation confined to the arm that asked for
    // it: the schema now permits both, so what stops every request carrying
    // both is the builder, and that is worth an assertion of its own.
    const req = buildAuthorizationRequest(withState({ vprClaims: claims }))

    expect(req.dcql_query).toBeDefined()
    expect(req.presentation_definition).toBeUndefined()
  })
})
