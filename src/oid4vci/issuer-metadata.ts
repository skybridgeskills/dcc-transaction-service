/**
 * Build the OID4VCI 1.0 §12.2 Credential Issuer Metadata document for
 * a per-exchange credential issuer URL.
 *
 * `credential_configurations_supported` is derived dynamically from
 * the exchange's VC template + the tenant's configured issuer
 * instances, so the metadata reflects exactly what this exchange will
 * issue.
 */
import {
  credentialIssuerUrlForExchange,
  deriveCredentialConfigurationId
} from './credential-offer.js'
import type {
  CredentialConfigurationSupported,
  IssuerMetadata
} from './schemas.js'

const DEFAULT_DI_ALG_VALUES = ['eddsa-rdfc-2022']

/**
 * Default `@context` to advertise when the VC template doesn't declare
 * one. We bias toward Open Badges 3.0 since that's the workhorse for
 * this service; consumers can override by including `@context` in the
 * template.
 */
const DEFAULT_VC_CONTEXT = [
  'https://www.w3.org/ns/credentials/v2',
  'https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json'
]

const arrayOfStrings = (v: unknown): string[] => {
  if (!v) return []
  const arr = Array.isArray(v) ? v : [v]
  return arr.filter((x): x is string => typeof x === 'string')
}

const cryptosuitesForTenant = (
  exchange: App.ExchangeDetailClaim,
  config: App.Config
): string[] => {
  const tenant = config.tenants[exchange.tenantName.toLowerCase()]
  const cryptosuites = tenant?.issuerInstances?.map((i) => i.cryptosuite) ?? []
  return cryptosuites.length > 0 ? cryptosuites : DEFAULT_DI_ALG_VALUES
}

const buildSupportedConfiguration = (
  exchange: App.ExchangeDetailClaim,
  config: App.Config
): CredentialConfigurationSupported => {
  let template: { type?: unknown; '@context'?: unknown } = {}
  try {
    template = JSON.parse(exchange.variables.vc) as {
      type?: unknown
      '@context'?: unknown
    }
  } catch {
    // Fall through to defaults; deriveCredentialConfigurationId already
    // copes with un-parseable templates.
  }

  const types = arrayOfStrings(template.type)
  if (types.length === 0) types.push('VerifiableCredential')

  const contexts = arrayOfStrings(template['@context'])
  const finalContexts = (contexts.length > 0 ? contexts : DEFAULT_VC_CONTEXT) as [
    string,
    ...string[]
  ]

  const algValues = cryptosuitesForTenant(exchange, config) as [
    string,
    ...string[]
  ]

  return {
    format: 'ldp_vc',
    credential_definition: {
      '@context': finalContexts,
      type: types as [string, ...string[]]
    },
    cryptographic_binding_methods_supported: ['did'],
    credential_signing_alg_values_supported: algValues,
    proof_types_supported: {
      di_vp: { proof_signing_alg_values_supported: algValues }
    }
  }
}

/**
 * Build the per-exchange Credential Issuer Metadata document, returned
 * by the well-known route. The exact same `credential_configuration_id`
 * is the key here as in the offer, so a wallet can look up the
 * configuration the offer pointed at.
 */
export const buildIssuerMetadata = (
  exchange: App.ExchangeDetailClaim,
  config: App.Config
): IssuerMetadata => {
  const issuer = credentialIssuerUrlForExchange(exchange)
  const configId = deriveCredentialConfigurationId(exchange.variables.vc)
  return {
    credential_issuer: issuer,
    authorization_servers: [issuer],
    credential_endpoint: `${issuer}/openid/credential`,
    nonce_endpoint: `${issuer}/openid/nonce`,
    credential_configurations_supported: {
      [configId]: buildSupportedConfiguration(exchange, config)
    }
  }
}
