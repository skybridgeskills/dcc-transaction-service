import type {
  EntityIdentityRegistry,
  VcRecognitionEntityIdentityRegistry
} from '@digitalcredentials/verifier-core'

let CONFIG: App.Config

const defaultPort = 4004
const defaultExchangeHost = 'http://localhost:4004'
const defaultSigningService = 'http://localhost:4006'
const defaultWorkflow = 'didAuth'
const defaultTenantName = 'default'
const defaultTenantToken = 'default'
const defaultTtlSeconds = 60 * 10 // exchange expires after ten minutes

const VC_RECOGNITION_URL_KEY =
  /^REGISTRY_VC_RECOGNITION_([A-Z0-9_]+)_URL$/

/** Built-in DCC registry entries; merged with env-driven VC recognition rows. */
const STATIC_KNOWN_REGISTRIES: Record<string, EntityIdentityRegistry> = {
  'DCC Sandbox Registry': {
    name: 'DCC Sandbox Registry',
    type: 'dcc-legacy',
    url: 'https://credentials-sandbox.dcconsortium.org/registry.json'
  },
  'DCC Community Registry': {
    name: 'DCC Community Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/community-registry/registry.json'
  },
  'DCC Registry': {
    name: 'DCC Member Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/dcc-registry/registry.json'
  }
}

/**
 * Reads optional VC Recognition registry definitions from the environment.
 *
 * For each slug `S` in `REGISTRY_VC_RECOGNITION_S_URL`, also set
 * `REGISTRY_VC_RECOGNITION_S_ACCEPTED_ISSUERS` (comma-separated DIDs/URLs).
 * The registry name for `trustedRegistries` / defaults is `VC_RECOGNITION_S`.
 */
export const parseVcRecognitionRegistriesFromEnv = (
  env: NodeJS.ProcessEnv
): Record<string, VcRecognitionEntityIdentityRegistry> => {
  const out: Record<string, VcRecognitionEntityIdentityRegistry> = {}

  for (const key of Object.keys(env)) {
    const m = key.match(VC_RECOGNITION_URL_KEY)
    if (!m) continue
    const slug = m[1]
    const rawUrl = env[key]
    const url = typeof rawUrl === 'string' ? rawUrl.trim() : ''
    if (!url) continue

    const issuersKey = `REGISTRY_VC_RECOGNITION_${slug}_ACCEPTED_ISSUERS`
    const issuersRaw = env[issuersKey]
    const issuersStr = typeof issuersRaw === 'string' ? issuersRaw.trim() : ''
    if (!issuersStr) {
      console.warn(
        `registry VC recognition ${slug}: missing or empty ${issuersKey} — skipped`
      )
      continue
    }
    const acceptedIssuers = issuersStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    if (acceptedIssuers.length === 0) {
      console.warn(
        `registry VC recognition ${slug}: no accepted issuers after parsing — skipped`
      )
      continue
    }

    const registryName = `VC_RECOGNITION_${slug}`
    out[registryName] = {
      name: registryName,
      type: 'vc-recognition',
      url,
      acceptedIssuers
    }
  }

  return out
}

const buildKnownRegistries = (
  env: typeof process.env
): Record<string, EntityIdentityRegistry> => ({
  ...STATIC_KNOWN_REGISTRIES,
  ...parseVcRecognitionRegistriesFromEnv(env)
})

/**
 * Map registry names to full EntityIdentityRegistry objects for verifier-core.
 * Falls back to creating a dcc-legacy registry with a default URL pattern
 * for unknown registries.
 */
export const mapRegistryNamesToRegistries = (
  registryNames: string[],
  knownRegistries: Record<string, EntityIdentityRegistry> = getConfig()
    .knownRegistries
): EntityIdentityRegistry[] => {
  return registryNames.map((name) => {
    if (name in knownRegistries) {
      return knownRegistries[name]
    }
    // For unknown registries, try to construct a reasonable default
    // This assumes the registry name might be a URL or we use a default pattern
    return {
      name,
      type: 'dcc-legacy',
      url: name.startsWith('http')
        ? name
        : `https://example.com/${name.toLowerCase().replace(/\s+/g, '-')}.json`
    }
  })
}

const parseIssuerInstancesForTenant = (
  env: typeof process.env,
  tenantNameLower: string
): App.IssuerInstance[] => {
  const suffix = tenantNameLower.toUpperCase()
  const instances: App.IssuerInstance[] = []
  for (let n = 1; ; n++) {
    const idKey = `TENANT_ISSUER_${n}_ID_${suffix}`
    const id = env[idKey]
    if (!id) {
      break
    }
    const cryptosuite =
      env[`TENANT_ISSUER_${n}_CRYPTOSUITE_${suffix}`] ?? 'eddsa-rdfc-2022'
    const signingServiceTenant =
      env[`TENANT_ISSUER_${n}_SIGNING_TENANT_${suffix}`] ?? tenantNameLower
    instances.push({ id, cryptosuite, signingServiceTenant })
  }
  return instances
}

const parseTenantsFromEnv = (env: typeof process.env) => {
  const tenants: Record<string, App.Tenant> = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('TENANT_TOKEN_') && value) {
      const tenantName = key.slice(13).toLowerCase()
      const issuerInstances = parseIssuerInstancesForTenant(env, tenantName)
      tenants[tenantName] = {
        tenantName,
        tenantToken: value,
        ...(issuerInstances.length > 0 ? { issuerInstances } : {})
      }
      if (env[`TENANT_ORIGIN_${tenantName}`]) {
        tenants[tenantName].origin = env[`TENANT_ORIGIN_${tenantName}`]
      }
    }
  }
  return tenants
}

const parseConfig = (): App.Config => {
  const tenants = parseTenantsFromEnv(process.env)

  const config: App.Config = {
    port: parseInt(process.env.PORT ?? '0') || defaultPort,
    defaultExchangeHost:
      process.env.DEFAULT_EXCHANGE_HOST ?? defaultExchangeHost,
    exchangeTtl: parseInt(process.env.EXCHANGE_TTL ?? '0') || defaultTtlSeconds,
    statusService: process.env.STATUS_SERVICE ?? '',
    signingService: process.env.SIGNING_SERVICE ?? defaultSigningService,

    defaultWorkflow: process.env.DEFAULT_WORKFLOW ?? defaultWorkflow,
    defaultTenantName: process.env.DEFAULT_TENANT_NAME ?? defaultTenantName,

    tenants,
    tenantAuthenticationEnabled: Object.keys(tenants).length > 0,

    // Keyv backend configuration
    keyvFilePath: process.env.PERSIST_TO_FILE,
    redisUri: process.env.REDIS_URI ?? undefined,
    keyvWriteDelayMs: parseInt(process.env.KEYV_WRITE_DELAY ?? '0') || 100, // 100ms
    keyvExpiredCheckDelayMs:
      parseInt(process.env.KEYV_EXPIRED_CHECK_DELAY ?? '0') || 4 * 3600 * 1000, // 4 hours

    // Verification workflow configuration - registry names (mapped to full config below)
    defaultTrustedRegistryNames: process.env.DEFAULT_TRUSTED_REGISTRIES
      ? process.env.DEFAULT_TRUSTED_REGISTRIES.split(',').map((r) => r.trim())
      : ['DCC Sandbox Registry', 'DCC Issuer Registry'],

    accessJwtSecret: process.env.ACCESS_JWT_SECRET ?? '',

    knownRegistries: buildKnownRegistries(process.env)
  }

  // Only if no tenants are configured, use the default tenant
  if (Object.keys(config.tenants).length === 0) {
    const issuerInstances = parseIssuerInstancesForTenant(
      process.env,
      defaultTenantName
    )
    config.tenants[defaultTenantName] = {
      tenantName: defaultTenantName,
      tenantToken: defaultTenantToken,
      ...(issuerInstances.length > 0 ? { issuerInstances } : {})
    }
  }

  return Object.freeze(config)
}

export const getConfig = () => {
  if (!CONFIG) {
    CONFIG = parseConfig()
  }
  return CONFIG
}

export const loadSecrets = async () => {}
