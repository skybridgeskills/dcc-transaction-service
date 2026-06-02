import { describe, expect, test } from 'vitest'
import {
  credentialErrorResponseSchema,
  credentialOfferSchema,
  credentialRequestSchema,
  credentialResponseSchema,
  issuerMetadataSchema,
  nonceResponseSchema,
  oid4vciAsMetadataSchema,
  PRE_AUTHORIZED_GRANT,
  tokenErrorResponseSchema,
  tokenRequestSchema,
  tokenResponseSchema
} from './schemas.js'

describe('credentialOfferSchema', () => {
  test('parses a minimal pre-authorized offer', () => {
    const offer = credentialOfferSchema.parse({
      credential_issuer: 'https://example.com/exchanges/abc',
      credential_configuration_ids: ['OpenBadgeCredential'],
      grants: {
        [PRE_AUTHORIZED_GRANT]: { 'pre-authorized_code': 'abc123' }
      }
    })
    expect(offer.credential_configuration_ids[0]).toBe('OpenBadgeCredential')
  })

  test('rejects an empty credential_configuration_ids array', () => {
    expect(() =>
      credentialOfferSchema.parse({
        credential_issuer: 'https://example.com',
        credential_configuration_ids: [],
        grants: {
          [PRE_AUTHORIZED_GRANT]: { 'pre-authorized_code': 'abc' }
        }
      })
    ).toThrow()
  })
})

describe('tokenRequestSchema / tokenResponseSchema', () => {
  test('accepts a pre-authorized token request', () => {
    const r = tokenRequestSchema.parse({
      grant_type: PRE_AUTHORIZED_GRANT,
      'pre-authorized_code': 'abc'
    })
    expect(r['pre-authorized_code']).toBe('abc')
  })

  test('rejects a missing grant_type', () => {
    expect(() =>
      tokenRequestSchema.parse({ 'pre-authorized_code': 'abc' })
    ).toThrow()
  })

  test('builds a valid token response', () => {
    const t = tokenResponseSchema.parse({
      access_token: 'opaque',
      token_type: 'Bearer',
      expires_in: 600
    })
    expect(t.token_type).toBe('Bearer')
  })
})

describe('tokenErrorResponseSchema', () => {
  test('accepts spec error codes', () => {
    for (const error of [
      'invalid_request',
      'invalid_grant',
      'unsupported_grant_type',
      'invalid_client'
    ] as const) {
      expect(tokenErrorResponseSchema.parse({ error }).error).toBe(error)
    }
  })

  test('rejects unknown codes', () => {
    expect(() =>
      tokenErrorResponseSchema.parse({ error: 'made_up' })
    ).toThrow()
  })
})

describe('nonceResponseSchema', () => {
  test('accepts a c_nonce', () => {
    expect(
      nonceResponseSchema.parse({ c_nonce: 'abc' }).c_nonce
    ).toBe('abc')
  })
  test('rejects an empty string', () => {
    expect(() => nonceResponseSchema.parse({ c_nonce: '' })).toThrow()
  })
})

describe('credentialRequestSchema', () => {
  test('accepts a request with a single di_vp proof', () => {
    const r = credentialRequestSchema.parse({
      credential_configuration_id: 'OpenBadgeCredential',
      proofs: { di_vp: [{ '@context': ['https://www.w3.org/ns/credentials/v2'] }] }
    })
    expect(r.proofs.di_vp.length).toBe(1)
  })

  test('rejects a request missing proofs.di_vp', () => {
    expect(() =>
      credentialRequestSchema.parse({
        credential_configuration_id: 'X',
        proofs: {}
      })
    ).toThrow()
  })

  test('rejects an empty di_vp array', () => {
    expect(() =>
      credentialRequestSchema.parse({
        credential_configuration_id: 'X',
        proofs: { di_vp: [] }
      })
    ).toThrow()
  })
})

describe('credentialResponseSchema', () => {
  test('accepts an immediate-issuance response', () => {
    const r = credentialResponseSchema.parse({
      credentials: [{ credential: { type: 'foo' } }]
    })
    expect(r.credentials.length).toBe(1)
  })

  test('rejects an empty credentials array', () => {
    expect(() => credentialResponseSchema.parse({ credentials: [] })).toThrow()
  })
})

describe('credentialErrorResponseSchema', () => {
  test('accepts spec error codes', () => {
    for (const error of [
      'invalid_credential_request',
      'unknown_credential_configuration',
      'unknown_credential_identifier',
      'invalid_proof',
      'invalid_nonce',
      'invalid_encryption_parameters',
      'credential_request_denied'
    ] as const) {
      expect(credentialErrorResponseSchema.parse({ error }).error).toBe(error)
    }
  })
})

describe('issuerMetadataSchema', () => {
  test('parses a minimal valid issuer metadata document', () => {
    const md = issuerMetadataSchema.parse({
      credential_issuer: 'https://issuer.example/exchanges/abc',
      authorization_servers: ['https://issuer.example/exchanges/abc'],
      credential_endpoint: 'https://issuer.example/exchanges/abc/openid/credential',
      nonce_endpoint: 'https://issuer.example/exchanges/abc/openid/nonce',
      credential_configurations_supported: {
        OpenBadgeCredential: {
          format: 'ldp_vc',
          credential_definition: {
            '@context': [
              'https://www.w3.org/ns/credentials/v2',
              'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
            ],
            type: ['VerifiableCredential', 'OpenBadgeCredential']
          }
        }
      }
    })
    expect(md.credential_configurations_supported.OpenBadgeCredential.format).toBe('ldp_vc')
  })

  test('rejects an empty authorization_servers array', () => {
    expect(() =>
      issuerMetadataSchema.parse({
        credential_issuer: 'https://x',
        authorization_servers: [],
        credential_endpoint: 'https://x/c',
        nonce_endpoint: 'https://x/n',
        credential_configurations_supported: {}
      })
    ).toThrow()
  })
})

describe('oid4vciAsMetadataSchema', () => {
  test('parses a minimal AS metadata for the pre-auth grant', () => {
    const md = oid4vciAsMetadataSchema.parse({
      issuer: 'https://issuer.example/exchanges/abc',
      token_endpoint: 'https://issuer.example/exchanges/abc/openid/token',
      grant_types_supported: [PRE_AUTHORIZED_GRANT],
      response_types_supported: [],
      token_endpoint_auth_methods_supported: ['none'],
      'pre-authorized_grant_anonymous_access_supported': true
    })
    expect(md.grant_types_supported[0]).toBe(PRE_AUTHORIZED_GRANT)
    expect(md['pre-authorized_grant_anonymous_access_supported']).toBe(true)
  })
})
