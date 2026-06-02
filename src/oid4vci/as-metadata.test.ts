import { describe, expect, test } from 'vitest'
import { buildOid4vciAsMetadata } from './as-metadata.js'
import { oid4vciAsMetadataSchema, PRE_AUTHORIZED_GRANT } from './schemas.js'

const claimExchange: App.ExchangeDetailClaim = {
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: '{"type":["VerifiableCredential"]}'
  }
}

describe('buildOid4vciAsMetadata', () => {
  test('produces a spec-shaped AS metadata document', () => {
    const md = oid4vciAsMetadataSchema.parse(buildOid4vciAsMetadata(claimExchange))
    expect(md.issuer).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123'
    )
    expect(md.token_endpoint).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123/openid/token'
    )
    expect(md.grant_types_supported).toEqual([PRE_AUTHORIZED_GRANT])
    expect(md.token_endpoint_auth_methods_supported).toEqual(['none'])
    expect(md['pre-authorized_grant_anonymous_access_supported']).toBe(true)
  })
})
