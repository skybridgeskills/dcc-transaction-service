import { describe, expect, test } from 'vitest'
import {
  OID4VP_CRYPTOSUITE_VALUES,
  VC_TYPE_IRI,
  authorizationRequestSchema,
  dcqlCredentialQuerySchema,
  dcqlQuerySchema,
  directPostResponseSchema,
  oid4vpErrorResponseSchema
} from './schemas.js'

describe('OID4VP · constants', () => {
  test('VC_TYPE_IRI is the expanded VCDM VerifiableCredential IRI', () => {
    expect(VC_TYPE_IRI).toBe(
      'https://www.w3.org/2018/credentials#VerifiableCredential'
    )
  })

  test('advertised cryptosuites are the two Data Integrity rdfc suites', () => {
    expect(OID4VP_CRYPTOSUITE_VALUES).toContain('ecdsa-rdfc-2019')
    expect(OID4VP_CRYPTOSUITE_VALUES).toContain('eddsa-rdfc-2022')
    expect(OID4VP_CRYPTOSUITE_VALUES).not.toContain('ed25519-signature-2020')
  })
})

describe('OID4VP · dcqlQuerySchema', () => {
  const validQuery = {
    credentials: [
      {
        id: 'credential',
        format: 'ldp_vc',
        meta: { type_values: [[VC_TYPE_IRI]] },
        claims: [{ path: ['credentialSubject', 'achievement', 'name'] }]
      }
    ]
  }

  test('accepts a well-formed query', () => {
    expect(() => dcqlQuerySchema.parse(validQuery)).not.toThrow()
  })

  test('rejects an empty credentials array', () => {
    expect(() => dcqlQuerySchema.parse({ credentials: [] })).toThrow()
  })

  test('rejects a non-ldp_vc format', () => {
    expect(() =>
      dcqlCredentialQuerySchema.parse({
        id: 'credential',
        format: 'jwt_vc',
        meta: { type_values: [[VC_TYPE_IRI]] }
      })
    ).toThrow()
  })

  test('rejects an empty claims array (must be omitted, not empty)', () => {
    expect(() =>
      dcqlCredentialQuerySchema.parse({
        id: 'credential',
        format: 'ldp_vc',
        meta: { type_values: [[VC_TYPE_IRI]] },
        claims: []
      })
    ).toThrow()
  })

  test('rejects an id with illegal characters', () => {
    expect(() =>
      dcqlCredentialQuerySchema.parse({
        id: 'has spaces',
        format: 'ldp_vc',
        meta: { type_values: [[VC_TYPE_IRI]] }
      })
    ).toThrow()
  })
})

describe('OID4VP · authorizationRequestSchema', () => {
  const base = {
    response_type: 'vp_token',
    response_mode: 'direct_post',
    client_id: 'redirect_uri:https://verifier.example/openid4vp/response',
    response_uri: 'https://verifier.example/openid4vp/response',
    nonce: 'challenge-123',
    state: 'state-abc',
    dcql_query: {
      credentials: [
        {
          id: 'credential',
          format: 'ldp_vc',
          meta: { type_values: [[VC_TYPE_IRI]] }
        }
      ]
    },
    client_metadata: {
      vp_formats_supported: {
        ldp_vc: {
          proof_type_values: ['DataIntegrityProof'],
          cryptosuite_values: ['ecdsa-rdfc-2019', 'eddsa-rdfc-2022']
        }
      }
    }
  }

  test('accepts a well-formed request', () => {
    expect(() => authorizationRequestSchema.parse(base)).not.toThrow()
  })

  test('requires response_type vp_token', () => {
    expect(() =>
      authorizationRequestSchema.parse({ ...base, response_type: 'code' })
    ).toThrow()
  })

  test('requires response_mode direct_post', () => {
    expect(() =>
      authorizationRequestSchema.parse({ ...base, response_mode: 'query' })
    ).toThrow()
  })

  test('state is optional', () => {
    const { state: _omit, ...withoutState } = base
    expect(() => authorizationRequestSchema.parse(withoutState)).not.toThrow()
  })
})

describe('OID4VP · directPostResponseSchema', () => {
  test('accepts a DCQL vp_token object keyed by query id', () => {
    const parsed = directPostResponseSchema.parse({
      vp_token: { credential: [{ type: 'VerifiablePresentation' }] },
      state: 'state-abc'
    })
    expect(parsed.vp_token.credential).toHaveLength(1)
  })

  test('rejects an empty presentation array under a query id', () => {
    expect(() =>
      directPostResponseSchema.parse({ vp_token: { credential: [] } })
    ).toThrow()
  })

  test('state is optional on the response', () => {
    expect(() =>
      directPostResponseSchema.parse({
        vp_token: { credential: [{}] }
      })
    ).not.toThrow()
  })
})

describe('OID4VP · oid4vpErrorResponseSchema', () => {
  test('accepts a known error code', () => {
    expect(() =>
      oid4vpErrorResponseSchema.parse({
        error: 'invalid_presentation',
        error_description: 'domain mismatch'
      })
    ).not.toThrow()
  })

  test('rejects an unknown error code', () => {
    expect(() =>
      oid4vpErrorResponseSchema.parse({ error: 'teapot' })
    ).toThrow()
  })
})
