/**
 * Readiness — *can this service run an exchange right now?*
 *
 * ## Why this is not `/healthz`
 *
 * `/healthz` (`src/health.ts`) is a **liveness** check: it writes a Keyv record,
 * sleeps `4 × keyvWriteDelayMs`, and reads it back. That answers "is the process
 * up and is its store working", it mutates state, and it is deliberately slow.
 * It is wired to a load balancer's target group and it is not repurposed here.
 *
 * Readiness answers a different question: every dependency an exchange needs is
 * present and answering, *before* anyone drives a phone at it.
 *
 * ## Why a breakdown and never a boolean
 *
 * The failure this whole service exists to stop is that **a fault in this
 * service presents as a generic success just as readily as a generic 500**. A
 * bare `{ready: false}` reproduces exactly that: it says an exchange cannot
 * start and says nothing about which of five services to go and look at. So
 * every dependency reports its own status and its own actionable `detail`, and
 * the top-level `ready` flag exists only to pick the HTTP status code.
 *
 * ## `skipped` is a real answer, not a pass
 *
 * A status service that is *not configured* is a legitimate deployment, so it
 * cannot be `unready`. It is also emphatically not `ok` — nothing is being
 * checked. `skipped` says so out loud, and the caller is where its *own*
 * requirement (say, "an issued credential must carry a `credentialStatus`")
 * turns a `skipped` into a FAIL. Readiness reports the shape of the deployment;
 * the caller judges that shape against what its own run needs.
 *
 * ## Nothing here mutates
 *
 * Readiness is safe to call in a loop, from a shell, while an exchange is in
 * flight. It never mints, never signs, never allocates a status entry. The
 * end-to-end assertions — that signing actually signs, that the status list
 * actually publishes — belong in a caller's own gate, which is allowed to burn
 * a credential; this route is not, because polling it must stay free.
 */
import axios from 'axios'
import { constants as fsConstants } from 'node:fs'
import { access, appendFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  didWebDocumentRoutes,
  fetchDidWebDocument,
  signingServiceDidDocumentUrl,
  type DidWebDocumentRoute
} from './did-web-document.js'
import { BOOT_PROVENANCE, type BootProvenance } from './boot-provenance.js'

/**
 * `ok` — checked and good. `unready` — checked and bad, do not start an
 * exchange. `skipped` — deliberately not checked, because this deployment is
 * not configured for it. `skipped` never makes the service unready on its own.
 */
export type ReadinessStatus = 'ok' | 'unready' | 'skipped'

export interface ReadinessDependency {
  /** Stable machine-readable name — callers grep these, so keep them stable. */
  name: string
  status: ReadinessStatus
  /** One actionable sentence. Never empty — that is the whole point. */
  detail: string
  /** The URL or path that was checked, when there is one. */
  target?: string
}

export interface Readiness {
  /**
   * True when no dependency is `unready`. It exists to choose 200 vs 503; the
   * `dependencies` array is the payload a human or a calling script reads.
   */
  ready: boolean
  checkedAt: string
  /**
   * Which code this process booted from — see `lib/boot-provenance.ts`.
   *
   * Deliberately **not** a member of `dependencies` and deliberately **not** a
   * term in `ready`. Every dependency is something outside this process that
   * was reached for and can be `unready`; provenance is a property of the
   * process itself, and a process cannot know whether it is stale — that is a
   * comparison against a working tree only the caller can see. It is published
   * as a fact so that whoever holds that working tree can make the comparison.
   */
  provenance: BootProvenance
  dependencies: ReadinessDependency[]
}

/** The outcome of one check that touched something outside this process. */
export interface CheckOutcome {
  ok: boolean
  detail: string
}

/**
 * The outbound effects readiness performs — every reach outside this process,
 * injected so the tests need no network, no disk and no clock.
 *
 * ⚠️ Deliberately narrow. This is the seam for `checkReadiness` and nothing
 * else: config still comes from `getConfig()`, and callers elsewhere reach for
 * `fetchDidWebDocument` and `appendFile` directly. Widening it would advertise
 * a repo-wide dependency-provision pattern that does not exist here.
 */
export interface ReadinessIO {
  /** GET a URL. `ok` when the response is 2xx or 3xx. */
  http: (url: string) => Promise<CheckOutcome>
  /** Fetch a published DID document, or throw. */
  didWebDocument: (
    route: DidWebDocumentRoute,
    config: App.Config
  ) => Promise<unknown>
  /** Can this service append to the journal path? */
  journalWritable: (path: string) => Promise<CheckOutcome>
  now: () => Date
}

const HTTP_TIMEOUT_MS = 5_000

export const defaultReadinessIO = (): ReadinessIO => ({
  http: async (url) => {
    try {
      const response = await axios.get(url, {
        timeout: HTTP_TIMEOUT_MS,
        // Any answer at all proves reachability; the status code is the detail.
        validateStatus: () => true
      })
      return response.status < 400
        ? { ok: true, detail: `answered HTTP ${response.status}` }
        : { ok: false, detail: `answered HTTP ${response.status}` }
    } catch (error) {
      return { ok: false, detail: describe(error) }
    }
  },
  didWebDocument: (route, config) => fetchDidWebDocument(route, config),
  journalWritable: async (path) => {
    try {
      await access(dirname(path), fsConstants.W_OK)
    } catch (error) {
      return {
        ok: false,
        detail: `the journal's directory is not writable: ${describe(error)}`
      }
    }
    try {
      // Appending nothing creates the file if absent and proves the open
      // succeeds, without adding a line the report emitter would then read.
      await appendFile(path, '')
      return { ok: true, detail: 'appendable' }
    } catch (error) {
      return { ok: false, detail: `cannot append: ${describe(error)}` }
    }
  },
  now: () => new Date()
})

const describe = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return error.code ? `${error.code} (no response)` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

const signingServiceDependency = async (
  config: App.Config,
  io: ReadinessIO
): Promise<ReadinessDependency> => {
  const target = config.signingService
  if (!target) {
    return {
      name: 'signing-service',
      status: 'unready',
      detail:
        'SIGNING_SERVICE is unset and there is no default — nothing can be issued.'
    }
  }
  const result = await io.http(target)
  return {
    name: 'signing-service',
    status: result.ok ? 'ok' : 'unready',
    target,
    detail: result.ok
      ? `reachable — ${result.detail}`
      : `unreachable — ${result.detail}. Start dcc-signing-service, or fix SIGNING_SERVICE.`
  }
}

const statusServiceDependencies = async (
  config: App.Config,
  io: ReadinessIO
): Promise<ReadinessDependency[]> => {
  if (!config.statusService) {
    return [
      {
        name: 'status-service',
        status: 'skipped',
        detail:
          'STATUS_SERVICE is unset — issued credentials will carry no credentialStatus.'
      }
    ]
  }
  const target = `${config.statusService.replace(/\/$/, '')}/healthz`
  const result = await io.http(target)
  const dependencies: ReadinessDependency[] = [
    {
      name: 'status-service',
      status: result.ok ? 'ok' : 'unready',
      target,
      detail: result.ok
        ? `reachable — ${result.detail}`
        : `unreachable — ${result.detail}. Start vcalm-status-service with \`pnpm dev\` (a bare \`pnpm start\` comes up with storage: memory, signing: fake), or fix STATUS_SERVICE.`
    }
  ]
  // A configured status service with no token is a *silent* failure at claim
  // time: allocate is Bearer-only on every write, so the claim 500s with a
  // message about the status list that says nothing about the missing token.
  dependencies.push({
    name: 'status-service-token',
    status: config.statusServiceToken ? 'ok' : 'unready',
    detail: config.statusServiceToken
      ? 'STATUS_SERVICE_TOKEN is set.'
      : 'STATUS_SERVICE is configured but STATUS_SERVICE_TOKEN is empty — every allocate will be refused, and the claim will fail with a message about the status list rather than about the token.'
  })
  return dependencies
}

const DID_PATTERN = /^did:[a-z0-9]+:.+/

const tenantsDependency = (config: App.Config): ReadinessDependency => {
  const tenants = Object.values(config.tenants)
  if (tenants.length === 0) {
    return {
      name: 'tenants',
      status: 'unready',
      detail: 'No tenants are configured; set TENANT_TOKEN_<NAME>.'
    }
  }
  const malformed: string[] = []
  let instanceCount = 0
  for (const tenant of tenants) {
    for (const instance of tenant.issuerInstances ?? []) {
      instanceCount += 1
      if (!DID_PATTERN.test(instance.id)) {
        malformed.push(`${tenant.tenantName}: "${instance.id}"`)
      }
    }
  }
  if (malformed.length > 0) {
    return {
      name: 'tenants',
      status: 'unready',
      detail: `${tenants.length} tenant(s), but these issuer-instance ids are not DIDs: ${malformed.join(', ')}.`
    }
  }
  return {
    name: 'tenants',
    status: 'ok',
    detail: `${tenants.length} tenant(s) configured, ${instanceCount} issuer instance(s).`
  }
}

const journalDependency = async (
  config: App.Config,
  io: ReadinessIO
): Promise<ReadinessDependency> => {
  const path = config.exchangeJournalPath
  if (!path) {
    return {
      name: 'exchange-journal',
      status: 'skipped',
      detail:
        'EXCHANGE_JOURNAL_PATH is unset — the journal is a no-op sink, and nothing that outlives the exchange TTL is being recorded.'
    }
  }
  const result = await io.journalWritable(path)
  return {
    name: 'exchange-journal',
    status: result.ok ? 'ok' : 'unready',
    target: path,
    detail: result.ok
      ? `writable — ${result.detail}`
      : `not writable — ${result.detail}`
  }
}

/**
 * One dependency per `did:web` document this service publishes.
 *
 * The document is fetched *and its `id` compared to the identifier it is served
 * for*. Reachability alone would not catch gap H1 — a document that resolves
 * but names a different subject than the issuer it is published under is worse
 * than one that 404s, because it looks fine.
 */
const didWebDependencies = async (
  config: App.Config,
  io: ReadinessIO
): Promise<ReadinessDependency[]> => {
  const routes = didWebDocumentRoutes(config)
  if (routes.length === 0) {
    return [
      {
        name: 'did-web-documents',
        status: 'skipped',
        detail:
          'No path-form did:web issuer instance is configured, so this service publishes no DID document. Set TENANT_ISSUER_<n>_ID_<TENANT> and TENANT_ISSUER_<n>_SIGNING_TENANT_<TENANT> if a tenant issues as did:web.'
      }
    ]
  }
  return Promise.all(
    routes.map(async (route) => {
      const name = `did-web-document:${route.didWebId}`
      const target = signingServiceDidDocumentUrl(
        config,
        route.signingServiceTenant
      )
      try {
        const document = (await io.didWebDocument(route, config)) as {
          id?: unknown
        }
        if (document?.id !== route.didWebId) {
          return {
            name,
            status: 'unready' as const,
            target,
            detail: `the derived document names "${String(
              document?.id
            )}" but is published as "${route.didWebId}" at ${route.path} — the issuer identifier and the signing key disagree (gap H1). Check TENANT_DID_URL_${route.signingServiceTenant.toUpperCase()} on the signing service.`
          }
        }
        return {
          name,
          status: 'ok' as const,
          target,
          detail: `derived and served at ${route.path}.`
        }
      } catch (error) {
        return {
          name,
          status: 'unready' as const,
          target,
          detail: `cannot be derived — ${describe(error)}`
        }
      }
    })
  )
}

/**
 * Run every readiness check. Pure with respect to this service's state: it
 * mints nothing, signs nothing and allocates nothing.
 */
export const checkReadiness = async (
  config: App.Config,
  io: ReadinessIO = defaultReadinessIO()
): Promise<Readiness> => {
  const [signing, status, journal, didWeb] = await Promise.all([
    signingServiceDependency(config, io),
    statusServiceDependencies(config, io),
    journalDependency(config, io),
    didWebDependencies(config, io)
  ])

  const dependencies: ReadinessDependency[] = [
    signing,
    ...status,
    tenantsDependency(config),
    journal,
    ...didWeb
  ]

  return {
    ready: dependencies.every((d) => d.status !== 'unready'),
    checkedAt: io.now().toISOString(),
    provenance: BOOT_PROVENANCE,
    dependencies
  }
}
