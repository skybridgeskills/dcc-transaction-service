import type {
  EntityIdentityRegistry,
  OidfEntityIdentityRegistry,
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

const VC_RECOGNITION_URL_KEY = /^REGISTRY_VC_RECOGNITION_([A-Z0-9_]+)_URL$/

const OIDF_TRUST_ANCHOR_EC_KEY = /^REGISTRY_OIDF_([A-Z0-9_]+)_TRUST_ANCHOR_EC$/

/**
 * Built-in DCC registry entries; merged with env-driven OIDF + VC recognition rows.
 *
 * These four URLs are the ones the DCC's own products ship — see
 * `learner-credential-wallet/app.config.js` (`KnownDidRegistries`) and
 * `dcc-web-verifier-plus/data/knownRegistries.ts`. Keeping the list identical to
 * theirs is deliberate: "in a trusted registry" then means here what it means
 * everywhere else in the DCC ecosystem, rather than something we invented.
 */
const STATIC_KNOWN_REGISTRIES: Record<string, EntityIdentityRegistry> = {
  'DCC Pilot Registry': {
    name: 'DCC Pilot Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/issuer-registry/registry.json'
  },
  'DCC Sandbox Registry': {
    name: 'DCC Sandbox Registry',
    type: 'dcc-legacy',
    url: 'https://digitalcredentials.github.io/sandbox-registry/registry.json'
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

/**
 * Reads optional OpenID Federation registry definitions from the environment.
 *
 * For each `REGISTRY_OIDF_S_TRUST_ANCHOR_EC`, `S` is the slug; the value is the
 * trust anchor entity-configuration URL (`trustAnchorEC`). The registry name for
 * `trustedRegistries` / defaults is `OIDF_S`.
 */
export const parseOidfRegistriesFromEnv = (
  env: NodeJS.ProcessEnv
): Record<string, OidfEntityIdentityRegistry> => {
  const out: Record<string, OidfEntityIdentityRegistry> = {}

  for (const key of Object.keys(env)) {
    const m = key.match(OIDF_TRUST_ANCHOR_EC_KEY)
    if (!m) continue
    const slug = m[1]
    const raw = env[key]
    const trustAnchorEC = typeof raw === 'string' ? raw.trim() : ''
    if (!trustAnchorEC) continue

    const registryName = `OIDF_${slug}`
    out[registryName] = {
      name: registryName,
      type: 'oidf',
      trustAnchorEC
    }
  }

  return out
}

const buildKnownRegistries = (
  env: typeof process.env
): Record<string, EntityIdentityRegistry> => ({
  ...STATIC_KNOWN_REGISTRIES,
  ...parseOidfRegistriesFromEnv(env),
  ...parseVcRecognitionRegistriesFromEnv(env)
})

/**
 * Map registry names to full EntityIdentityRegistry objects for verifier-core.
 *
 * A name that is itself an `http(s)` URL is taken as an ad-hoc `dcc-legacy`
 * registry. Any other unknown name **throws**.
 *
 * This used to fabricate `https://example.com/<slug>.json` for unknown names,
 * which is how the default `'DCC Issuer Registry'` — a name that was never a key
 * here — spent four months being fetched from `example.com` and reported only as
 * a soft "could not be checked". A trust source is the wrong place for a helpful
 * default: an unresolvable name is a configuration error, not a registry to invent.
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
    if (name.startsWith('http')) {
      return { name, type: 'dcc-legacy', url: name }
    }
    throw new Error(
      `unknown registry ${JSON.stringify(name)}: not a configured registry ` +
        `and not an http(s) URL. Known registries: ` +
        `${Object.keys(knownRegistries).join(', ')}`
    )
  })
}

/**
 * Registries to consult for one verify exchange, or `undefined` to **skip** the
 * issuer-registry suite entirely.
 *
 * ⚠️ `undefined` and `[]` are not the same thing. verifier-core's
 * `issuer-registry-check` skips only on a falsy `context.registries`; an empty
 * array is truthy, so it runs the lookup against zero registries and reports a
 * bare `failure` — "Issuer was not found in any known DID registry" — without
 * even the "could not be checked" softener. Returning `undefined` is what
 * produces the honest `skipped`.
 */
export const resolveTrustedRegistries = (
  exchangeTrustedRegistries: string[] | undefined,
  config: App.Config = getConfig()
): EntityIdentityRegistry[] | undefined => {
  const names =
    exchangeTrustedRegistries && exchangeTrustedRegistries.length > 0
      ? exchangeTrustedRegistries
      : config.defaultTrustedRegistryNames
  if (names.length === 0) {
    return undefined
  }
  return mapRegistryNamesToRegistries(names, config.knownRegistries)
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

/** Default true; set `UI_SHOW_DETAILS=false` (or `0` / `no`) to disable. */
const parseUiShowDetails = (raw: string | undefined): boolean => {
  if (raw === undefined || raw === '') return true
  const v = raw.trim().toLowerCase()
  if (v === 'false' || v === '0' || v === 'no') return false
  return true
}

/**
 * The tenant's protocol profile name, from `TENANT_PROFILE_<NAME>`.
 *
 * ⚠️ The suffix is UPPERCASED, matching `TENANT_ISSUER_*` rather than
 * `TENANT_ORIGIN_*`. Tenant names are derived by lowercasing whatever followed
 * `TENANT_TOKEN_`, so an uppercase lookup is the one that works regardless of
 * how the declaring variable was cased. An empty value reads as unset, so
 * `TENANT_PROFILE_ACME=` in an env file names nothing rather than naming `''`.
 */
const parseProtocolProfileForTenant = (
  env: typeof process.env,
  tenantNameLower: string
): string | undefined => {
  const raw = env[`TENANT_PROFILE_${tenantNameLower.toUpperCase()}`]
  const name = typeof raw === 'string' ? raw.trim() : ''
  return name || undefined
}

const parseTenantsFromEnv = (env: typeof process.env) => {
  const tenants: Record<string, App.Tenant> = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('TENANT_TOKEN_') && value) {
      const tenantName = key.slice(13).toLowerCase()
      const issuerInstances = parseIssuerInstancesForTenant(env, tenantName)
      const protocolProfileName = parseProtocolProfileForTenant(env, tenantName)
      tenants[tenantName] = {
        tenantName,
        tenantToken: value,
        ...(issuerInstances.length > 0 ? { issuerInstances } : {}),
        ...(protocolProfileName ? { protocolProfileName } : {})
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
    statusServiceToken: process.env.STATUS_SERVICE_TOKEN ?? '',
    signingService: process.env.SIGNING_SERVICE ?? defaultSigningService,

    defaultWorkflow: process.env.DEFAULT_WORKFLOW ?? defaultWorkflow,
    defaultTenantName: process.env.DEFAULT_TENANT_NAME ?? defaultTenantName,

    uiShowDetails: parseUiShowDetails(process.env.UI_SHOW_DETAILS),

    tenants,
    tenantAuthenticationEnabled: Object.keys(tenants).length > 0,

    /**
     * Filesystem path for the append-only exchange journal (JSONL).
     *
     * Unset — the default — makes the journal a no-op sink: no file is opened
     * or created and no lifecycle event is recorded. The journal is opt-in
     * because it is unbounded by construction (no TTL, never truncated by this
     * service), so a deployment has to choose where that growth lives.
     *
     * An empty value is treated as unset, so `EXCHANGE_JOURNAL_PATH=` in an
     * env file disables the journal rather than resolving to `''`.
     */
    exchangeJournalPath: process.env.EXCHANGE_JOURNAL_PATH || undefined,

    // Keyv backend configuration
    keyvFilePath: process.env.PERSIST_TO_FILE,
    redisUri: process.env.REDIS_URI ?? undefined,
    keyvWriteDelayMs: parseInt(process.env.KEYV_WRITE_DELAY ?? '0') || 100, // 100ms
    keyvExpiredCheckDelayMs:
      parseInt(process.env.KEYV_EXPIRED_CHECK_DELAY ?? '0') || 4 * 3600 * 1000, // 4 hours

    /**
     * Registry names consulted when an exchange names none of its own.
     *
     * **Empty by default**, which skips the issuer-registry suite — see
     * {@link resolveTrustedRegistries}. Empty because the issuers this service
     * drives are in none of the four DCC registries (nor are the VC Playground
     * issuers), so the only verdict a live lookup can produce here is a red
     * about our own issuer, on a check that is non-fatal and gates nothing.
     * `skipped` says what is true — we did not ask.
     *
     * Set `DEFAULT_TRUSTED_REGISTRIES` to a comma-separated list of names from
     * {@link STATIC_KNOWN_REGISTRIES} (or `http(s)` URLs) to turn checks back on.
     */
    defaultTrustedRegistryNames: process.env.DEFAULT_TRUSTED_REGISTRIES
      ? process.env.DEFAULT_TRUSTED_REGISTRIES.split(',')
          .map((r) => r.trim())
          .filter((r) => r.length > 0)
      : [],

    accessJwtSecret: process.env.ACCESS_JWT_SECRET ?? '',

    knownRegistries: buildKnownRegistries(process.env),

    /** Set `EXCHANGE_DEBUG_DEFAULT=true` to attach compatibility-fix and other debug log entries
     * to `variables.results` by default. */
    defaultExchangeDebug: process.env.EXCHANGE_DEBUG_DEFAULT === 'true',

    /**
     * Per-attempt deadline for asynchronous verify tasks. Override with
     * `VERIFY_TASK_DEADLINE_MS`; defaults to 60s.
     */
    verifyTaskDeadlineMs:
      parseInt(process.env.VERIFY_TASK_DEADLINE_MS ?? '0') || 60_000,

    /**
     * Maximum attempts (initial + retries) for an async verify task.
     * Override with `VERIFY_TASK_MAX_ATTEMPTS`; defaults to 2.
     */
    verifyTaskMaxAttempts:
      parseInt(process.env.VERIFY_TASK_MAX_ATTEMPTS ?? '0') || 2,

    /**
     * Protocol profile served when neither the exchange nor its tenant names
     * one — the last of the three resolution layers.
     *
     * ⚠️ Unset means "no layer names a profile", and resolution throws rather
     * than choosing. That is deliberate: a deployment that has not said which
     * profile it serves cannot have its bytes attributed to a name, and a
     * service that guesses produces records nobody can reproduce.
     */
    defaultProtocolProfileName:
      process.env.DEFAULT_PROTOCOL_PROFILE?.trim() || undefined
  }

  // Fail fast on a misconfigured trust source. `mapRegistryNamesToRegistries`
  // throws on an unknown name; doing it here means a typo costs one clear
  // startup error rather than months of vacuous "could not be checked" verdicts.
  mapRegistryNamesToRegistries(
    config.defaultTrustedRegistryNames,
    config.knownRegistries
  )

  // Only if no tenants are configured, use the default tenant
  if (Object.keys(config.tenants).length === 0) {
    const issuerInstances = parseIssuerInstancesForTenant(
      process.env,
      defaultTenantName
    )
    const protocolProfileName = parseProtocolProfileForTenant(
      process.env,
      defaultTenantName
    )
    config.tenants[defaultTenantName] = {
      tenantName: defaultTenantName,
      tenantToken: defaultTenantToken,
      ...(issuerInstances.length > 0 ? { issuerInstances } : {}),
      ...(protocolProfileName ? { protocolProfileName } : {})
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
