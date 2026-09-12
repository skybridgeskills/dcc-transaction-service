import { describe, expect, test } from 'vitest'
import { buildIssuerMetadata } from './issuer-metadata.js'
import { issuerMetadataSchema } from './schemas.js'

const baseConfig: App.Config = {
  port: 4004,
  defaultExchangeHost: 'https://issuer.example',
  exchangeTtl: 600,
  statusService: '',
  statusServiceToken: '',
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

/**
 * ACCOMMODATION — `token-endpoint-inline`, VARIANT, default off.
 *
 * ⛔ The first test here is the load-bearing one. Serving `token_endpoint`
 * inline on every exchange would make every wallet look conformant and erase,
 * for every product at once, whatever reads `discovery-served` lines to tell
 * real discovery from a constructed guess. Default-off is the property that
 * keeps that distinction, so it is pinned rather than assumed.
 */
describe('token-endpoint-inline accommodation', () => {
  test('DEFAULT OFF — no token_endpoint inline unless the exchange opts in', () => {
    const md = buildIssuerMetadata(exchange(), baseConfig)
    expect(md.token_endpoint).toBeUndefined()
    expect(Object.keys(md)).not.toContain('token_endpoint')
    // The strict route stays the advertised one.
    expect(md.authorization_servers).toEqual([
      'https://issuer.example/workflows/claim/exchanges/abc-123'
    ])
  })

  test('opt-in serves token_endpoint inline AND keeps authorization_servers', () => {
    const md = buildIssuerMetadata(
      exchange({
        variables: {
          challenge: 'chal',
          exchangeHost: 'https://issuer.example',
          vc: '{"@context":["https://www.w3.org/ns/credentials/v2"],"type":["VerifiableCredential"]}',
          oid4vciTokenEndpointInline: true
        }
      }),
      baseConfig
    )
    expect(md.token_endpoint).toBe(
      'https://issuer.example/workflows/claim/exchanges/abc-123/openid/token'
    )
    // The accommodation ADDS; it never replaces the strict route.
    expect(md.authorization_servers).toEqual([
      'https://issuer.example/workflows/claim/exchanges/abc-123'
    ])
    expect(() => issuerMetadataSchema.parse(md)).not.toThrow()
  })

  test('the inline value is the SAME value AS metadata discovers — one source of truth', async () => {
    const { buildOid4vciAsMetadata } = await import('./as-metadata.js')
    const ex = exchange({
      variables: {
        challenge: 'chal',
        exchangeHost: 'https://issuer.example',
        vc: '{"@context":["https://www.w3.org/ns/credentials/v2"],"type":["VerifiableCredential"]}',
        oid4vciTokenEndpointInline: true
      }
    })
    const inline = buildIssuerMetadata(ex, baseConfig).token_endpoint
    const discovered = buildOid4vciAsMetadata(ex).token_endpoint
    expect(inline).toBe(discovered)
  })
})
