let CONFIG: App.Config

const defaultPort = 4004
const defaultExchangeHost = 'http://localhost:4004'
const defaultSigningService = 'http://localhost:4006'
const defaultWorkflow = 'didAuth'
const defaultTenantName = 'default'
const defaultTenantToken = 'default'
const defaultTtlSeconds = 60 * 10 // exchange expires after ten minutes

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
    defaultExchangeHost: process.env.DEFAULT_EXCHANGE_HOST ?? defaultExchangeHost,
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

    // Verification workflow configuration
    defaultTrustedRegistries: process.env.DEFAULT_TRUSTED_REGISTRIES
      ? process.env.DEFAULT_TRUSTED_REGISTRIES.split(',').map((r) => r.trim())
      : ['DCC Sandbox Registry', 'DCC Issuer Registry'],

    accessJwtSecret: process.env.ACCESS_JWT_SECRET ?? ''
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
