/**
 * Serving a `did:web` issuer's DID document at the identifier's own URL.
 *
 * ## Why this service serves it at all
 *
 * The authority in `did:web:<host>:<path…>` is the **host**. Our issuer
 * identifier is `did:web:example.com:ui:example-tenant`, and the tunnelled
 * host is this service — so whatever a wallet or verifier resolves, it
 * resolves from here. The identifier is not a free choice either: a
 * partner's already-issued credentials name it, and re-identifying the issuer
 * would break resolution for every credential already issued under it.
 *
 * ## Why a proxy and not a copy
 *
 * The bytes are fetched from `dcc-signing-service`, which *derives* them from
 * the same seed and URL that produce the signature. The alternatives were a
 * repo-tracked `did.json` and a `TENANT_DID_DOCUMENT_<T>` env var, and both
 * are the same thing: a hand-maintained copy of a derived value.
 *
 * That copy is gap H1. The published document said one thing, the configured
 * seed produced another, the issuer identifier and the signing key disagreed,
 * and nothing compared them — it went unnoticed through an entire status
 * service milestone. Proxying publishes *the* document rather than a copy of
 * it, so the disagreement is not merely unlikely, it is unrepresentable.
 *
 * The price, paid knowingly: resolving this DID now depends on the signing
 * service being reachable. A failure therefore surfaces as a **502 with a
 * legible message** naming the DID, the URL tried and the environment variables
 * to check — and never as a generic 500 and never as a stale-but-plausible
 * document.
 *
 * ## Route ordering
 *
 * The path form of the identifier lands *inside* `/ui/*`, which is a static
 * mount over `./dist/`. `pnpm dev` runs `vite build` with `emptyOutDir: true`
 * and wipes anything hand-placed there. The interception in `hono.ts` is
 * therefore registered **ahead** of that mount; see the comment at the call
 * site.
 */
import axios from 'axios'

/** How long a fetched document is reused. */
const CACHE_TTL_MS = 60_000

const DID_WEB_PREFIX = 'did:web:'

/** One publishable DID document: which DID, which signing tenant, which path. */
export interface DidWebDocumentRoute {
  /** The issuer instance's DID, e.g. `did:web:host:ui:example-tenant`. */
  didWebId: string
  /** Signing-service tenant that holds the seed, e.g. `example-tenant`. */
  signingServiceTenant: string
  /** Request path this DID resolves to, e.g. `/ui/example-tenant/did.json`. */
  path: string
}

interface CacheEntry {
  expiresAt: number
  document: unknown
}

const cache = new Map<string, CacheEntry>()

/** Drop every cached document. Tests only. */
export const clearDidWebDocumentCache = (): void => {
  cache.clear()
}

/**
 * The resolution path for a `did:web` identifier, per the did:web method
 * spec: colon-separated segments after the host become path segments, each
 * percent-decoded, and `did.json` is appended.
 *
 * Returns `undefined` for a **bare-domain** DID (`did:web:example.com`), whose
 * document lives at `/.well-known/did.json`. Deliberately out of scope: the
 * identifier in use is path-form, as it was for the partner whose
 * already-issued credentials fix it. A bare-domain issuer would need a route
 * outside `/ui/*` and a decision about what else claims that host's
 * `.well-known`, and nothing needs it yet.
 */
export const didWebDocumentPath = (didWebId: string): string | undefined => {
  if (!didWebId.startsWith(DID_WEB_PREFIX)) return undefined
  const segments = didWebId.slice(DID_WEB_PREFIX.length).split(':')
  // segments[0] is the host authority; the rest are the path.
  const pathSegments = segments.slice(1).filter(Boolean)
  if (pathSegments.length === 0) return undefined
  let decoded: string[]
  try {
    decoded = pathSegments.map(decodeURIComponent)
  } catch {
    // A malformed percent-escape means this is not a DID we can host. Skip it
    // rather than throwing: one bad issuer instance in config must not take
    // down document hosting for the others.
    return undefined
  }
  return `/${decoded.join('/')}/did.json`
}

/**
 * Every `did:web` document this service can publish, derived from the tenant
 * configuration that already exists.
 *
 * No new configuration on purpose. `issuerInstances` already carries both
 * halves — `id` (the DID, so the path) and `signingServiceTenant` (whose seed
 * derives it) — so hosting follows from issuing being configured, and there is
 * no third place for the tenant segment to be written down differently.
 * Hardcoding the tenant segment would have been a fourth.
 */
export const didWebDocumentRoutes = (
  config: App.Config
): DidWebDocumentRoute[] => {
  const routes: DidWebDocumentRoute[] = []
  const seen = new Set<string>()
  for (const tenant of Object.values(config.tenants)) {
    for (const instance of tenant.issuerInstances ?? []) {
      const path = didWebDocumentPath(instance.id)
      if (!path || seen.has(path)) continue
      seen.add(path)
      routes.push({
        didWebId: instance.id,
        signingServiceTenant: instance.signingServiceTenant,
        path
      })
    }
  }
  return routes
}

/**
 * Match a request path against the configured `did:web` documents.
 *
 * **Matches on the path alone, never on the `Host` header.** Two reasons: the
 * tunnelled host is not reliably visible to us (proxies rewrite `Host`, and
 * this route is deliberately fetched over `localhost` too), and the document's
 * authority is asserted by its own `id` — which the signing service derives
 * from `TENANT_DID_URL_<TENANT>`, not from anything in the request. Serving
 * the same bytes on every hostname that reaches us cannot make them disagree
 * with the key; refusing on a rewritten `Host` would only make the document
 * unresolvable in the two places we most need to fetch it from.
 */
export const resolveDidWebDocumentRoute = (
  path: string,
  config: App.Config
): DidWebDocumentRoute | undefined =>
  didWebDocumentRoutes(config).find((route) => route.path === path)

/** Where the signing service publishes a tenant's derived document. */
export const signingServiceDidDocumentUrl = (
  config: App.Config,
  signingServiceTenant: string
): string =>
  `${config.signingService}/instance/${signingServiceTenant}/did.json`

/**
 * Fetch a tenant's DID document from the signing service, through a short
 * in-memory cache.
 *
 * The cache is safe because the document is a pure function of a fixed seed
 * and a fixed URL — it cannot change within a run — and it is short because
 * the only thing that *does* change it is a config edit plus a restart, and a
 * minute of staleness after a restart of the *other* service is not worth a
 * stale-document class of bug. Nothing negative is cached: an outage must stay
 * visible on the next request, not be pinned for a minute.
 *
 * @throws {DidWebDocumentUnavailableError} when the signing service cannot be
 *   reached or refuses. Callers turn this into a 502 — the document being
 *   unresolvable is a fault in *our* stack, not in the caller's request.
 */
export const fetchDidWebDocument = async (
  route: DidWebDocumentRoute,
  config: App.Config,
  now: number = Date.now()
): Promise<unknown> => {
  const url = signingServiceDidDocumentUrl(config, route.signingServiceTenant)
  const cached = cache.get(url)
  if (cached && cached.expiresAt > now) return cached.document

  let document: unknown
  try {
    const response = await axios.get(url)
    document = response.data
  } catch (error) {
    throw new DidWebDocumentUnavailableError(route, url, error)
  }

  if (!document || typeof document !== 'object') {
    throw new DidWebDocumentUnavailableError(
      route,
      url,
      new Error(`signing service returned a non-object body`)
    )
  }

  cache.set(url, { expiresAt: now + CACHE_TTL_MS, document })
  return document
}

/**
 * The signing service could not supply the document.
 *
 * Carries the DID, the URL that was tried and the upstream cause, because the
 * whole point of a legible 502 here is that whoever reads it can tell a
 * mis-set `SIGNING_SERVICE` from a mis-set `TENANT_DIDMETHOD_*` without
 * opening a debugger.
 */
export class DidWebDocumentUnavailableError extends Error {
  constructor(
    readonly route: DidWebDocumentRoute,
    readonly url: string,
    readonly cause: unknown
  ) {
    super(
      `Could not fetch the DID document for ${route.didWebId} from the signing ` +
        `service at ${url}: ${describeCause(cause)}. The document is derived by ` +
        `the signing service from tenant '${route.signingServiceTenant}'; check ` +
        `SIGNING_SERVICE, and that TENANT_DIDMETHOD_${route.signingServiceTenant.toUpperCase()}=web ` +
        `and TENANT_DID_URL_${route.signingServiceTenant.toUpperCase()} are set there.`
    )
    this.name = 'DidWebDocumentUnavailableError'
  }
}

const describeCause = (cause: unknown): string => {
  if (axios.isAxiosError(cause)) {
    const status = cause.response?.status
    const upstream = (cause.response?.data as { message?: string } | undefined)
      ?.message
    if (status) {
      return `HTTP ${status}${upstream ? ` — ${upstream}` : ''}`
    }
    return cause.code ? `${cause.code} (no response)` : cause.message
  }
  return cause instanceof Error ? cause.message : String(cause)
}
