import { describe, expect, test } from 'vitest'
import { buildIssuerMetadata } from './issuer-metadata.js'
import { issuerMetadataSchema } from './schemas.js'

const baseConfig: App.Config = {
  port: 4004,
  defaultExchangeHost: 'https://issuer.example',
  exchangeTtl: 600,
  statusService: '',
  signingService: 'http://localhost:4006',
  defaultWorkflow: 'didAuth',
  defaultTenantName: 'default',
  uiShowDetails: true,
  accessJwtSecret: '',
  keyvWriteDelayMs: 50,
  keyvExpiredCheckDelayMs: 4 * 3600 * 1000,
  tenants: {
    default: { tenantName: 'default', tenantToken: 'tok' }
  },
  tenantAuthenticationEnabled: false,
  defaultTrustedRegistryNames: [],
  knownRegistries: {},
  defaultExchangeDebug: false,
  verifyTaskDeadlineMs: 60_000,
  verifyTaskMaxAttempts: 2
}

const exchange = (
  overrides: Partial<App.ExchangeDetailClaim> = {}
): App.ExchangeDetailClaim => ({
  tenantName: 'default',
  workflowId: 'claim',
  exchangeId: 'abc-123',
  expires: new Date(Date.now() + 60_000).toISOString(),
  state: 'pending',
  variables: {
    challenge: 'chal',
    exchangeHost: 'https://issuer.example',
    vc: '{"@context":["https://www.w3.org/ns/credentials/v2"],"type":["VerifiableCredential","OpenBadgeCredential"]}'
  },
  ...overrides
})

describe('buildIssuerMetadata', () => {
  test('produces a spec-shaped metadata document for an Open Badge template', () => {
    const md = buildIssuerMetadata(exchange(), baseConfig)
    const parsed = issuerMetadataSchema.parse(md)
    expect(parsed.credential_issuer).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123'
    )
    expect(parsed.credential_endpoint).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123/openid/credential'
    )
    expect(parsed.nonce_endpoint).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123/openid/nonce'
    )
    expect(parsed.authorization_servers[0]).toBe(parsed.credential_issuer)
    const config = parsed.credential_configurations_supported.OpenBadgeCredential
    expect(config).toBeDefined()
    expect(config.format).toBe('ldp_vc')
    expect(config.credential_definition.type).toContain('OpenBadgeCredential')
    expect(config.credential_definition['@context'][0]).toBe(
      'https://www.w3.org/ns/credentials/v2'
    )
    expect(config.credential_signing_alg_values_supported).toEqual([
      'eddsa-rdfc-2022'
    ])
    expect(
      config.proof_types_supported?.di_vp?.proof_signing_alg_values_supported
    ).toEqual(['eddsa-rdfc-2022'])
  })

  test('honors tenant.issuerInstances cryptosuite list', () => {
    const config: App.Config = {
      ...baseConfig,
      tenants: {
        default: {
          tenantName: 'default',
          tenantToken: 'tok',
          issuerInstances: [
            {
              id: 'did:web:issuer.example',
              cryptosuite: 'ecdsa-rdfc-2019',
              signingServiceTenant: 'p-256'
            },
            {
              id: 'did:web:issuer.example#ed',
              cryptosuite: 'eddsa-rdfc-2022',
              signingServiceTenant: 'eddsa'
            }
          ]
        }
      }
    }
    const md = buildIssuerMetadata(exchange(), config)
    const config1 = md.credential_configurations_supported.OpenBadgeCredential
    expect(config1.credential_signing_alg_values_supported).toEqual([
      'ecdsa-rdfc-2019',
      'eddsa-rdfc-2022'
    ])
  })

  test('falls back to default context when the template lacks one', () => {
    const ex = exchange({
      variables: {
        ...exchange().variables,
        vc: '{"type":["VerifiableCredential","OpenBadgeCredential"]}'
      }
    })
    const md = buildIssuerMetadata(ex, baseConfig)
    expect(
      md.credential_configurations_supported.OpenBadgeCredential
        .credential_definition['@context']
    ).toContain('https://www.w3.org/ns/credentials/v2')
  })
})
