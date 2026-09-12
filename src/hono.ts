import { Hono, type Context } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import {
  createExchangeBatch,
  createExchangeVcapi,
  getInteractionsForExchange
} from './exchanges.js'
import {
  buildCredentialOffer,
  buildIssuerMetadata,
  buildOid4vciAsMetadata,
  ensurePreAuthorizedCode,
  handleCredentialRequest,
  handleNonceRequest,
  handleTokenRequest
} from './oid4vci/index.js'
import {
  REQUEST_OBJECT_JWT_MEDIA_TYPE,
  buildAuthorizationRequest,
  ensureOid4vpState,
  handleOid4vpResponse,
  resolveDelivery,
  resolveQueryLanguage
} from './oid4vp/index.js'
import {
  tryResolveProtocolProfile,
  wireProfileForExchange
} from './protocol-profiles/for-exchange.js'
import { electedProfileExchange } from './protocol-profiles/election.js'
import { offerablePresets } from './protocol-profiles/offerable.js'
import { recordInteractionMethodElection } from './lib/interaction-method-election.js'
import {
  authenticateTenantMiddleware,
  authenticateExchangeOrTenantMiddleware
} from './auth.js'
import { healthCheck, readinessCheck } from './health.js'
import { HTTPException } from 'hono/http-exception'
import * as schema from './schema.js'
import { validator } from 'hono/validator'
import z from 'zod'
import { JSONObject } from 'hono/utils/types'
import { getWorkflow } from './workflows.js'
import { getConfig } from './config.js'
import {
  getExchangeData,
  getExchangeDataById,
  saveExchange
} from './transactionManager.js'
import { resolveInteraction } from './interactions.js'
import { sweepIfTimedOut } from './lib/verify-task/sweep-verify-task.js'
import { resolveExchangeTenant } from './lib/tenant/resolve-exchange-tenant.js'
import { setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'
import { handleOAuthTokenPost } from './oauth/token.js'
import { oauthAuthorizationServerMetadata } from './oauth/metadata.js'
import { journalExchangeEvent } from './journal/index.js'
import { requestAttribution } from './journal/attribution.js'
import { participateAndJournal } from './lib/journalled-participation.js'
import { recordDiscoveryElection } from './lib/discovery-election.js'
import { describeInteractionMethod } from './lib/interaction-method.js'
import {
  DidWebDocumentUnavailableError,
  fetchDidWebDocument,
  resolveDidWebDocumentRoute
} from './lib/did-web-document.js'
import {
  RequestObjectSigningUnavailableError,
  signRequestObject
} from './lib/request-object-signing.js'
import { EntityIdentityUnavailableError } from './lib/entity-identity.js'

/**
 * Wraps a Hono handler with error handling
 * @param {Function} viewHandler - The Hono handler to wrap
 * @returns {Function} Hono middleware function
 */
const handleErrors = (err: unknown, c: Context) => {
  if (err instanceof HTTPException) {
    c.status(err.status)
    const body: Record<string, unknown> = {
      code: err.status,
      message: err.message
    }
    const cause = err.cause as { problemDetails?: unknown } | undefined
    if (
      cause &&
      typeof cause === 'object' &&
      'problemDetails' in cause &&
      Array.isArray((cause as { problemDetails: unknown }).problemDetails)
    ) {
      body.problemDetails = (
        cause as { problemDetails: unknown[] }
      ).problemDetails
    }
    return c.json(body)
  } else if (err instanceof z.ZodError) {
    c.status(400)
    return c.json({
      code: 400,
      message: err.errors.map((e) => e.message).join(', '),
      details: err.errors
    })
  } else if (err instanceof RequestObjectSigningUnavailableError) {
    // ⚠️ A 502, and the upstream's own words, because the generic branch below
    // would render this as `{"code":500,"message":"An unexpected error
    // occurred"}` — the exact discard `lib/upstream-call.ts` was written after.
    // A wallet fetching mid-exchange is the worst possible moment to lose a
    // diagnosis: the operator sees a failed present and, without this message,
    // attributes it to the wallet. 502 says plainly that this service is fine
    // and its upstream is not, which is the distinction the journal record has
    // to preserve.
    console.error(`OID4VP request object could not be signed: ${err.message}`)
    c.status(502)
    return c.json({ code: 502, message: err.message })
  } else if (err instanceof EntityIdentityUnavailableError) {
    // ⚠️ 500 and not 400, even though a caller naming a `decentralized-identifier`
    // profile can trigger it. The same error arrives from `DEFAULT_PROTOCOL_PROFILE`
    // and `TENANT_PROFILE_<NAME>`, which are deployment configuration, and a 400
    // would blame the caller for what is usually the deployment's fault. Loud
    // rather than lenient, per `normaliseDidDocument`: better a 500 nobody can
    // miss than a 200 nobody checks — and the message names the env vars.
    console.error(`Entity identity unavailable: ${err.message}`)
    c.status(500)
    return c.json({ code: 500, message: err.message })
  } else {
    console.error('Unexpected error:', err)
    c.status(500)
    return c.json({
      code: 500,
      message: 'An unexpected error occurred'
    })
  }
}

// Validation

const validateJson = (value: JSONObject, _c: Context) => {
  // pass-through validator, will get failures if the JSON is invalid
  return value
}

const addWorkflowByParam = createMiddleware<{
  Variables: {
    workflow: App.Workflow
  }
}>(async (c, next) => {
  const param = c.req.param('workflowId')
  if (param) {
    const workflow = getWorkflow(param)
    if (!workflow) {
      throw new HTTPException(404, { message: 'Workflow not found' })
    }
    c.set('workflow', workflow)
  }
  await next()
})

// Middleware
const setConfigContext = createMiddleware<{
  Variables: {
    config: App.Config
    workflow?: App.Workflow
  }
}>(async (c, next) => {
  c.set('config', getConfig())
  await next()
})

/** A listing of all application routes */
const routes = {
  index: '/',
  healthz: '/healthz',
  /**
   * Readiness, distinct from `healthz` above. `healthz` is liveness — it
   * mutates the store and sleeps; this one answers "can an exchange run right
   * now" with a per-dependency breakdown and touches nothing.
   */
  healthReady: '/health/ready',
  exchangeBatchCreate: '/exchange',
  legacyExchangeDetail: '/exchange/:exchangeId', // This might not be used anymore if it is not referenced by the exchange creation
  exchangeCreate: '/workflows/:workflowId/exchanges',
  exchangeDetail: '/workflows/:workflowId/exchanges/:exchangeId',
  /**
   * ACCOMMODATION — `bare-vp-participate-response` in the accommodations
   * register. The VC-API participate route again, returning the presentation
   * BARE (top-level `type` / `verifiableCredential`) instead of wrapped in
   * `{ verifiablePresentation }`.
   *
   * ⚠️ **A concession, not a dialect.** VC-API §"Participate in an exchange"
   * returns the wrapped form and nothing sanctions the bare one. A completion
   * here is NOT evidence that the client speaks VC-API participate — only that
   * it speaks the bare form.
   *
   * Elective: both shapes are live on the same exchange, and which body you get
   * is which URL you POST to — visible on the wire, with no state and no
   * negotiation. `routes.exchangeDetail` is unchanged and still returns the
   * envelope, which `app.test.ts` pins.
   *
   * ⛔ NOT a query parameter on `exchangeDetail`. That would leave the route
   * identical and make this a payload variant on the strict route — which
   * ADR 2026-08-26 distinguishes by emitted bytes, and to which it explicitly
   * does NOT generalise `accommodation-served`. A distinct path is a distinct
   * route, which is the case that ADR covers.
   *
   * ⛔ NOT named for the product that needs it. See
   * `docs/adr/2026-08-24-protocol-profile-surface.md` §7.
   */
  bareVpParticipate: '/workflows/:workflowId/exchanges/:exchangeId/bare-vp',
  protocols: '/workflows/:workflowId/exchanges/:exchangeId/protocols',
  interaction: '/interactions/:exchangeId',
  /**
   * The interaction page reporting which payload its QR is currently showing.
   * A write-only observation endpoint: it records and returns 204, and its
   * failure never reaches the operator.
   */
  interactionMethod: '/interactions/:exchangeId/method',
  /**
   * The launch presets the interaction page may offer for this exchange.
   *
   * ⚠️ **A sibling of `interactionMethod`, and for the same reason: it is
   * SPA-facing, not wallet-facing.** `routes.interaction` is content-negotiated
   * and a wallet reads its JSON, so adding `presets` to that response would
   * change what a wallet sees — a wire change, and out of scope. Its own route
   * keeps the two audiences apart.
   */
  interactionPresets: '/interactions/:exchangeId/presets',
  // OID4VCI 1.0 Pre-Authorized Code Flow (per-exchange scope).
  oid4vciCredentialOffer:
    '/workflows/:workflowId/exchanges/:exchangeId/openid/credential-offer',
  oid4vciToken: '/workflows/:workflowId/exchanges/:exchangeId/openid/token',
  /**
   * ACCOMMODATION — `token-endpoint-by-convention` in the accommodations
   * register. The token endpoint again, at the path a client reaches by
   * appending `/token` to `authorization_servers[0]` instead of fetching
   * `.well-known/oauth-authorization-server` and reading `token_endpoint` out
   * of it.
   *
   * ⚠️ **This route is not conformance, and serving it does not make a client
   * that uses it conformant.** RFC 8414 discovery is mandated; constructing
   * the URL is a guess. What it buys is everything downstream of the token:
   * without this route, a client that constructs the URL meets a `404` at the
   * token request, and everything past the token goes unobserved.
   *
   * The distinction survives because the discriminator is elsewhere:
   * whatever reads `discovery-served` lines to tell real discovery from a
   * constructed guess sees none from this route, because this route writes
   * none. A client that constructs the URL still leaves no discovery line,
   * and that absence is still the fact worth having.
   *
   * ⛔ The fix this is NOT: advertising a `token_endpoint` in issuer metadata.
   * That would make every wallet look conformant and erase the distinction for
   * every product at once. The strict route stays the advertised one —
   * `buildOid4vciAsMetadata` is unchanged and still names `/openid/token`,
   * which is the property `oid4vci/issuer-metadata.test.ts` asserts.
   */
  oid4vciTokenByConvention:
    '/workflows/:workflowId/exchanges/:exchangeId/token',
  oid4vciNonce: '/workflows/:workflowId/exchanges/:exchangeId/openid/nonce',
  oid4vciCredential:
    '/workflows/:workflowId/exchanges/:exchangeId/openid/credential',
  // OID4VP 1.0 verifier binding (per-exchange scope, verify workflow only).
  oid4vpRequest:
    '/workflows/:workflowId/exchanges/:exchangeId/openid4vp/request',
  oid4vpResponse:
    '/workflows/:workflowId/exchanges/:exchangeId/openid4vp/response',
  // RFC 8615 path-suffix well-known URLs. The wallet computes these from
  // the `credential_issuer` URL it gets in the credential offer.
  oid4vciIssuerMetadata:
    '/.well-known/openid-credential-issuer/workflows/:workflowId/exchanges/:exchangeId',
  oid4vciAuthorizationServerMetadata:
    '/.well-known/oauth-authorization-server/workflows/:workflowId/exchanges/:exchangeId',
  // OIDC-Discovery-style concatenation: well-known APPENDED to the issuer
  // identifier. RFC 8414 §3.1 specifies the path-suffix form above for
  // identifiers that carry a path, and a per-exchange `credential_issuer`
  // always does — but wallets in the wild compute this form instead, and a
  // mismatch here blanks out the whole downstream OID4VCI flow (token, nonce,
  // proof of possession, credential). We serve both, and log which one was
  // used so the wallet's discovery style stays observable.
  oid4vciIssuerMetadataConcat:
    '/workflows/:workflowId/exchanges/:exchangeId/.well-known/openid-credential-issuer',
  oid4vciAuthorizationServerMetadataConcat:
    '/workflows/:workflowId/exchanges/:exchangeId/.well-known/oauth-authorization-server',
  // Deliberate interop alias. This is the OpenID Connect Discovery name and we
  // answer it with OID4VCI AS metadata, which is NOT a conformant OIDC OP
  // metadata document. Served because wallets request it during OID4VCI
  // discovery alongside the two names above.
  oid4vciOpenidConfigurationConcat:
    '/workflows/:workflowId/exchanges/:exchangeId/.well-known/openid-configuration'
}

/**
 * Record that a metadata document was served, and under which construction.
 *
 * Serving both constructions (see the routes table) makes this service
 * permissive, so it no longer discriminates on its own — which is why the
 * client's choice has to be written down rather than inferred from an outcome.
 *
 * Goes to three places on purpose:
 *
 * - **stdout**, for someone watching a running service;
 * - **the journal**, for whoever reads back afterwards, once the exchange
 *   record has been evicted and stdout has rolled;
 * - **the exchange record**, for a caller polling `GET` on the exchange, which
 *   has no access to either of the above.
 *
 * The journal keeps every fetch; the record keeps the deduplicated set in
 * first-fetch order (see `lib/discovery-election.ts`).
 *
 * @returns the exchange as it now stands, so the caller renders metadata from
 * the same object that was persisted.
 */
const recordDiscovery = async (
  construction: App.DiscoveryConstruction,
  doc: App.DiscoveryDoc,
  exchange: App.ExchangeDetailClaim,
  attribution: Record<string, string>
): Promise<App.ExchangeDetailClaim> => {
  console.log(
    `oid4vci discovery: construction=${construction} doc=${doc} exchange=${exchange.exchangeId}`
  )
  // Attribution belongs on this line for the same reason it belongs on
  // `request-served`: which client fetched is a fact about the wallet, and it
  // exists nowhere else once the process is gone. See `journal/attribution.ts`.
  journalExchangeEvent(exchange, 'discovery-served', {
    construction,
    doc,
    ...attribution
  })

  const elected = recordDiscoveryElection(exchange, construction, doc)
  if (!elected.isNew) return exchange
  try {
    // Read-modify-write with no compare-and-swap. The read is `getExchangeData`
    // immediately above the caller and the only work in between is synchronous,
    // so the window is a single event-loop turn; two discovery fetches racing
    // inside it would cost one election on the record. The journal line is
    // written unconditionally and is not subject to the race, so the fact
    // survives either way.
    await saveExchange(elected.exchange)
    return elected.exchange
  } catch (error) {
    // Recording an observation must never change what a client sees. A record
    // that cannot be written costs us one signal; failing the discovery
    // request would cost the whole exchange, and would do it precisely when the
    // store is already unhealthy.
    console.warn(
      `oid4vci discovery: failed to record election (exchange=${exchange.exchangeId}): ${error}`
    )
    return exchange
  }
}

/**
 * Load the claim exchange a metadata document describes, 404ing anything that
 * is not a claim exchange. Shared so the two discovery constructions cannot
 * drift apart — a divergence between them is the exact failure this pair of
 * routes exists to prevent.
 */
const getClaimExchangeForMetadata = async (c: Context) => {
  const exchangeId = c.req.param('exchangeId')!
  const exchange = await getExchangeData(exchangeId, c.req.param('workflowId')!)
  if (exchange.workflowId !== 'claim') {
    throw new HTTPException(404, { message: 'Unknown exchange' })
  }
  return { exchange: exchange as App.ExchangeDetailClaim }
}

const issuerMetadataHandler =
  (construction: App.DiscoveryConstruction) => async (c: Context) => {
    const { exchange } = await getClaimExchangeForMetadata(c)
    const recorded = await recordDiscovery(construction, 'issuer', exchange, requestAttribution(c))
    return c.json(buildIssuerMetadata(recorded, c.var.config))
  }

const asMetadataHandler =
  (construction: App.DiscoveryConstruction, doc: App.DiscoveryDoc = 'as') =>
  async (c: Context) => {
    const { exchange } = await getClaimExchangeForMetadata(c)
    const recorded = await recordDiscovery(construction, doc, exchange, requestAttribution(c))
    return c.json(buildOid4vciAsMetadata(recorded))
  }

/**
 * The OID4VCI Token Endpoint, shared by the route the metadata advertises and
 * the route a client reaches by construction.
 *
 * `route` is the only difference between them, and it exists to be written
 * down rather than to change behaviour: the two answer identically, because an
 * accommodation that answered differently would be a second implementation to
 * keep in step rather than a second doorway onto the first.
 *
 * ⚠️ **The accommodated route writes `accommodation-served`, never
 * `discovery-served`.** Whatever reads `discovery-served` lines to tell real
 * discovery from a constructed guess sees none from this route, and the whole
 * point is that a client which constructs this URL produces none. Marking
 * this route as a discovery would make the guess indistinguishable from the
 * discovery it replaced. See `journal/types.ts` and
 * `routes.oid4vciTokenByConvention`.
 */
const tokenEndpointHandler =
  (route: 'discovered' | 'by-convention') => async (c: Context) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI token endpoint is only available for claim exchanges'
      })
    }
    const claim = exchange as App.ExchangeDetailClaim
    if (route === 'by-convention') {
      // Journalled on arrival, before the grant is judged: a client that
      // constructed the URL and then presented a bad code still constructed
      // the URL, and that is the fact this line carries. Writing it only on
      // success would lose exactly the case the accommodation was built for.
      journalExchangeEvent(claim, 'accommodation-served', {
        accommodation: 'token-endpoint-by-convention',
        endpoint: 'token',
        ...requestAttribution(c)
      })
    }
    const body = await c.req.parseBody()
    const result = handleTokenRequest(body, claim)
    if (!result.ok) {
      c.header('Cache-Control', 'no-store')
      return c.json(result.body, result.status)
    }
    await saveExchange(result.exchange)
    c.header('Cache-Control', 'no-store')
    return c.json(result.response)
  }

/**
 * Strip the VC-API participation envelope, leaving the presentation bare.
 *
 * ⚠️ **A pure envelope change** — the VP and its proof are untouched, so nothing
 * cryptographic moves. This is the outbound mirror of
 * `compatibility/vcalm-participation-message/wrap-bare-presentation.ts`, which
 * accepts a bare VP on the way IN; the two are the same construction seen from
 * opposite directions.
 *
 * ⚠️ **Anything that is not the envelope passes through untouched.** The claim
 * workflow returns `{ redirectUrl }` when no credential template is configured,
 * and the initial step of an exchange returns
 * `{ verifiablePresentationRequest }`. Neither is a participation envelope and
 * neither is a bare-VP client's to parse; unwrapping speculatively would
 * corrupt them.
 */
const unwrapParticipationResult = (result: unknown): unknown => {
  if (!result || typeof result !== 'object') return result
  const envelope = (result as Record<string, unknown>).verifiablePresentation
  if (!envelope || typeof envelope !== 'object') return result
  return envelope
}

/**
 * What {@link participateHandler} needs from its context: the two variables the
 * app-level middleware sets, plus the body `validator('json', validateJson)`
 * has already parsed.
 *
 * ⚠️ Stated rather than inferred because the handler is a factory registered on
 * two routes. Written out here, `c.req.valid('json')` stays type-checked at both
 * of them; the alternative is a cast at the call site, which would silently
 * accept a registration that forgot the validator middleware.
 */
type ParticipateContext = Context<
  { Variables: { config: App.Config; workflow: App.Workflow } },
  string,
  { out: { json: JSONObject } }
>

/**
 * VC-API participation, shared by the strict route and the bare-VP doorway.
 *
 * `route` is the only difference between them, and — as with
 * {@link tokenEndpointHandler} — it exists to be written down rather than to
 * change behaviour. The exchange is processed identically, the persisted record
 * is byte-identical on both arms, and the ONLY divergence is the envelope of
 * the response and one journal line.
 *
 * ⚠️ **The accommodated route writes `accommodation-served`, and no strict
 * event it stands in for.** It still writes `submission` — via
 * `participateAndJournal`, on the same `arm: 'vc-api'` — because the inbound
 * DID-auth is real and spec-shaped, and pretending otherwise would lose a
 * genuine submission. What it must never do is let a completion here read as
 * evidence that the client parses the VC-API envelope. See
 * `docs/adr/2026-08-26-accommodated-routes-record-themselves.md`.
 *
 * ⚠️ **The unwrap is HERE and not in `participateInClaimExchange`.** The
 * workflow keeps returning the spec shape, so the decision cannot be tripped by
 * a future caller reaching that function another way, and the exchange record
 * stays identical on both arms — the arms are told apart by the journal, never
 * by the credential.
 */
const participateHandler =
  (route: 'vcapi' | 'bare-vp') => async (c: ParticipateContext) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.var.workflow.id
    )

    if (route === 'bare-vp') {
      if (exchange.workflowId !== 'claim') {
        throw new HTTPException(400, {
          message:
            'The bare-vp participate doorway is only available for claim exchanges'
        })
      }
      // Journalled on arrival, before the DID-auth is judged: a client that
      // came in this door and then presented a bad proof still came in this
      // door, and that is the fact this line carries. Writing it only on
      // success would lose exactly the case the accommodation was built for.
      journalExchangeEvent(exchange, 'accommodation-served', {
        accommodation: 'bare-vp-participate-response',
        endpoint: 'participate',
        ...requestAttribution(c)
      })
    }

    // Wrapped, not called directly: three `throw HTTPException(400)` sites in
    // `preparePresentationForVerify` end this request without ever reaching
    // `saveExchange`, which is what writes `terminal`. See
    // `lib/journalled-participation.ts` — the invariant is that whatever ends
    // the request ends it in the journal too.
    const result = await participateAndJournal({
      data: c.req.valid('json'),
      config: c.var.config,
      workflow: c.var.workflow,
      exchange,
      arm: 'vc-api',
      attribution: requestAttribution(c)
    })

    return c.json(
      (route === 'bare-vp'
        ? unwrapParticipationResult(result)
        : result) as Record<string, unknown>
    )
  }

/**
 * Publish a configured `did:web` issuer's DID document at the identifier's own
 * URL, by proxying the signing service that derives it.
 *
 * See `lib/did-web-document.ts` for why this is a proxy and not a stored copy
 * (short version: a copy is gap H1 — issuer says one thing, key says another),
 * and the registration site below for why the ordering is load-bearing.
 *
 * A signing-service failure is a **502**, not a 500: this service is fine, its
 * upstream is not, and the message names the DID and the URL that was tried so
 * the difference can be named. Pinned by `did-web.app.test.ts`.
 */
const serveDidWebDocument = createMiddleware(async (c, next) => {
  if (c.req.method !== 'GET') return next()
  const route = resolveDidWebDocumentRoute(c.req.path, getConfig())
  if (!route) return next()

  let document: unknown
  try {
    document = await fetchDidWebDocument(route, getConfig())
  } catch (error) {
    if (error instanceof DidWebDocumentUnavailableError) {
      console.error(`did:web document unavailable: ${error.message}`)
      throw new HTTPException(502, { message: error.message, cause: error })
    }
    throw error
  }

  // `application/did+json` is the registered media type, but wallets and
  // verifiers in the wild fetch this with plain JSON expectations and some
  // reject the registered type. `application/json` is what a did:web document
  // is served as everywhere it currently works, partner deployments included.
  return c.json(document as Record<string, unknown>)
})

export const app = new Hono()

  .notFound((c) => {
    return c.json({ code: 404, message: 'Not found' }, 404)
  })
  .onError(handleErrors)

  .use(logger())
  .use(cors())

  // ─── did:web document hosting ────────────────────────────────────────────
  //
  // MUST stay ahead of the `/ui/*` static mount below. Do not move it.
  //
  // A path-form `did:web` identifier resolves inside `/ui/` —
  // `did:web:host:ui:tenant` → `/ui/tenant/did.json` — which is the directory
  // `serveStatic` serves out of `./dist/`. `pnpm dev` runs `vite build` with
  // `emptyOutDir: true`, so a `did.json` placed there by hand is deleted by
  // the next build and the issuer's DID silently stops resolving. A route
  // registered first cannot be wiped by a build, and is the reason this
  // survives `pnpm dev`.
  //
  // It is `.use`, not `.get`, precisely so it runs before the static handler
  // in the same `/ui/*` match; and it must also run before `setConfigContext`,
  // which is why it calls `getConfig()` itself rather than reading `c.var`.
  //
  // Anything that is not a configured DID document falls through untouched.
  .use('/ui/*', serveDidWebDocument)

  .use('/ui/*', serveStatic({ root: './dist/' }))
  .use(setConfigContext)

  // Config Handler adds config to the context
  .use(async (c, next) => {
    await next()
  })

  // Basic health check
  .get(routes.index, async (c) => {
    return c.json({ message: 'transaction-service server status: ok.' })
  })

  // Extended health check
  .get(routes.healthz, healthCheck)

  // Readiness — every dependency an exchange needs, reported one by one.
  .get(routes.healthReady, (c) => readinessCheck(c))

  // OAuth 2.0 client_credentials (M2M access JWT for tenant API)
  .post('/oauth/token', async (c) => handleOAuthTokenPost(c))

  // RFC 8414 Authorization Server Metadata
  .get('/.well-known/oauth-authorization-server', (c) =>
    c.json(oauthAuthorizationServerMetadata(c.var.config))
  )

  /*
  This is step 1 in an exchange. Creates a new exchange and stores the provided data for later use
  in the exchange, in particular the subject data with which to later construct the VC. Returns a
  walletQuery object with both deeplinks with which to trigger wallet selection that in turn will
  trigger the exchange when the wallet opens.
  */

  // DCC draft protocol for a batch of exchanges that returns wallet queries
  .post(
    routes.exchangeBatchCreate,
    authenticateTenantMiddleware,
    validator('json', validateJson),
    async (c) => {
      const body = c.req.valid('json')
      const data = schema.exchangeBatchSchema.parse(body)
      data.tenantName = resolveExchangeTenant({
        bodyTenantName: data.tenantName,
        authTenant: c.var.authTenant,
        defaultTenantName: c.var.config.defaultTenantName
      })
      c.set('workflow', getWorkflow(data.workflowId ?? 'didAuth'))
      return c.json(
        await createExchangeBatch({
          data,
          config: c.var.config,
          workflow: c.var.workflow!
        })
      )
    }
  )

  // VC-API 0.7 as of 2025-06-08 for a single exchange.
  .post(
    routes.exchangeCreate,
    authenticateTenantMiddleware,
    validator('json', validateJson),
    addWorkflowByParam,
    async (c) => {
      const inputData = c.req.valid('json')

      // Initial basic structure validation
      const data = schema.vcApiExchangeCreateSchema.parse(inputData)

      data.variables.tenantName = resolveExchangeTenant({
        bodyTenantName: data.variables.tenantName,
        authTenant: c.var.authTenant,
        defaultTenantName: c.var.config.defaultTenantName
      })

      return c.json(
        await createExchangeVcapi({
          data,
          config: c.var.config,
          workflow: c.var.workflow
        })
      )
    }
  )

  /*
  This is step 2 in an exchange, where the wallet has asked to initiate the exchange, and we
  reply here with a Verifiable Presentation Request, asking for a DIDAuth. Note that in some
  scenarios the wallet may skip this step and directly present the DIDAuth.

  This also handles step 3 in the exchange, where the user presents their DIDAuth and receives
  the result.
  */
  // DCC draft protocol
  .post(
    routes.legacyExchangeDetail,
    validator('json', validateJson),
    async (c) => {
      c.set('workflow', getWorkflow('didAuth'))
      const exchange = await getExchangeData(
        c.req.param('exchangeId')!,
        c.var.workflow!.id
      )
      return c.json(
        await participateAndJournal({
          data: null,
          config: c.var.config,
          workflow: c.var.workflow!,
          exchange,
          arm: 'vc-api',
          attribution: requestAttribution(c)
        })
      )
    }
  )

  // VC-API 0.7 as of 2025-06-08
  .post(
    routes.exchangeDetail,
    validator('json', validateJson),
    addWorkflowByParam,
    participateHandler('vcapi')
  )

  /*
  ACCOMMODATION — the same handler at a second address, returning the
  presentation bare. See `routes.bareVpParticipate` for why it is a route and
  not a parameter, and `docs/accommodations.md` for what it costs to read a
  result gathered here.
  */
  .post(
    routes.bareVpParticipate,
    validator('json', validateJson),
    addWorkflowByParam,
    participateHandler('bare-vp')
  )

  // Get Exchange State
  .get(
    routes.exchangeDetail,
    authenticateExchangeOrTenantMiddleware,
    addWorkflowByParam,
    async (c) => {
      const loaded = await getExchangeData(
        c.req.param('exchangeId')!,
        c.var.workflow.id
      )
      if (!c.var.exchangeTokenAuth) {
        const authEnabled = c.var.config.tenantAuthenticationEnabled
        if (
          authEnabled &&
          c.var.authTenant &&
          c.var.authTenant.tenantName !== loaded?.tenantName
        ) {
          throw new HTTPException(401, { message: 'Unauthorized' })
        }
      }

      // GET-driven sweep: a polling client trips the retry / give-up
      // transitions for verify exchanges with a lapsed verifyTask.
      // No-op for non-verify and healthy-verify exchanges.
      const exchange = await sweepIfTimedOut(loaded, c.var.config)
      return c.json(exchange)
    }
  )

  /* Cross-protocol interactions object. The URL for (the exchangeHost proxy for) this endpoint is
  used in QR codes and deep links. It supplies information about the protocols that may be used to
  interact with this exchange. Eventually we'll use this URL as QR code contents for wallet to scan.
  VC-API 0.7 as of 2025-06-08: https://w3c-ccg.github.io/vc-api/#interaction-url-format
  */
  .get(routes.protocols, async (c) => {
    const result = await getInteractionsForExchange(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!,
      c.var.config
    )
    if (!result) {
      return c.json({ code: 404, message: 'Exchange not found' }, 404)
    }
    return c.json(result)
  })

  /*
  OID4VCI 1.0 Credential Issuer Metadata (§12.2) — RFC 8615 path-suffix well-known.
  Wallets construct this URL from the `credential_issuer` value in the credential
  offer.
  */
  .get(routes.oid4vciIssuerMetadata, issuerMetadataHandler('rfc8414-path-suffix'))

  /*
  RFC 8414 OAuth Authorization Server Metadata, per-exchange. Distinct from the
  global `/.well-known/oauth-authorization-server` which serves tenant-API
  metadata. This advertises the per-exchange OID4VCI Token Endpoint and the
  `urn:ietf:params:oauth:grant-type:pre-authorized_code` grant type.
  */
  .get(
    routes.oid4vciAuthorizationServerMetadata,
    asMetadataHandler('rfc8414-path-suffix')
  )

  /*
  The same two documents, reachable by OIDC-Discovery-style concatenation —
  well-known appended to the issuer identifier. Same handlers, so the two
  constructions cannot diverge. See the routes table for why both are served.
  */
  .get(routes.oid4vciIssuerMetadataConcat, issuerMetadataHandler('oidc-concat'))
  .get(
    routes.oid4vciAuthorizationServerMetadataConcat,
    asMetadataHandler('oidc-concat')
  )
  .get(
    routes.oid4vciOpenidConfigurationConcat,
    asMetadataHandler('oidc-concat', 'openid-configuration')
  )

  /*
  OID4VCI 1.0 Credential Offer — fetched by the wallet from the URI embedded in the
  `openid-credential-offer://?credential_offer_uri=...` deep link. The first GET lazily
  mints + persists the pre-authorized code; subsequent GETs return the same offer until
  the code is redeemed or the exchange expires.
  */
  .get(routes.oid4vciCredentialOffer, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI credential offer is only available for claim exchanges'
      })
    }
    const claim = exchange as App.ExchangeDetailClaim
    // Bound the pre-auth code TTL by the exchange's own expiry.
    const exchangeRemainingSec = Math.max(
      1,
      Math.floor((new Date(claim.expires).getTime() - Date.now()) / 1000)
    )
    const codeTtlSec = Math.min(600, exchangeRemainingSec)
    const ensured = ensurePreAuthorizedCode(claim, codeTtlSec)
    if (ensured.isNew) {
      await saveExchange(ensured.exchange)
    }
    return c.json(buildCredentialOffer(ensured.exchange))
  })

  /*
  OID4VP 1.0 Authorization Request (§5) — fetched by the wallet from the `request_uri`
  embedded in the `openid4vp://?client_id=...&request_uri=...` deep link. Served as
  unsigned JSON (the `redirect_uri` client_id prefix forbids signing). The first GET
  lazily mints + persists the single-use `state`; subsequent GETs return the same
  request until the exchange completes or expires.
  */
  .on(['GET', 'POST'], routes.oid4vpRequest, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'verify') {
      throw new HTTPException(400, {
        message:
          'OID4VP authorization request is only available for verify exchanges'
      })
    }
    const ensured = ensureOid4vpState(exchange as App.ExchangeDetailVerify)
    if (ensured.isNew) {
      await saveExchange(ensured.exchange)
    }

    // RENDER-TIME ELECTION.
    //
    // ⚠️ **After the save, never before.** `ensureOid4vpState` mutates and
    // persists the REAL exchange; the elected copy is made from the result and
    // never reaches `saveExchange`. Persisting it would write the election onto
    // the record, which is exactly what the observation-only rule on elections
    // forbids (`protocol-profiles/election.ts`, `electedProfileExchange`) —
    // and the rule is enforced by that ordering rather than by a promise.
    //
    // ⚠️ **Every subsequent read in this handler uses `forBytes`.** A single
    // read left on `ensured.exchange` would build one field of the request under
    // the active profile while the rest came from the elected one, which is the
    // partly-honoured election `assertElectable` refuses elsewhere — arriving
    // here by omission instead.
    const electedName = c.req.query('protocolProfile')
    const forBytes = electedName
      ? electedProfileExchange(
          ensured.exchange,
          electedName,
          c.var.config
        )
      : ensured.exchange
    const servedProfileName = tryResolveProtocolProfile(
      forBytes,
      c.var.config
    )?.name
    // The fetch itself is evidence, and for a wire-only wallet it may be the
    // ONLY evidence: no device log exists to fall back on. Which client
    // software fetched, and whether it reached us from the device or through a
    // relay, is a fact about the other party that lives on the wire for one
    // request and then nowhere. It is written down here so a later failure can
    // be attributed to the right side rather than guessed at.
    //
    // ⚠️ BY-REFERENCE ARM ONLY, and the line says so. A by-value request puts
    // every parameter inline in the deep link and never issues this GET, so on
    // that arm the absence of a `request-served` line means *this arm was not in
    // use* — never *the wallet did not fetch*. The `mint` line carries the
    // elected delivery so a reader can tell those two apart without guessing.
    journalExchangeEvent(forBytes, 'request-served', {
      delivery: resolveDelivery(forBytes),
      queryLanguage: resolveQueryLanguage(forBytes),
      // ⚠️ Which METHOD the wallet used is a fact about the wallet and exists
      // nowhere else. Where a request advertises `request_uri_method:
      // post`, whether a wallet took it, ignored it, or never read it is the
      // difference between three explanations of the same outcome, and it is
      // invisible unless it is written down here.
      method: c.req.method,
      // ⚠️ WHICH ENVELOPE went out, written down at the moment it is decided.
      // This line is journalled BEFORE the signed arm calls the signing
      // service, deliberately: the fetch genuinely happened, and a
      // `request-served` followed by an `error` is the honest record of a
      // wallet that fetched and got a 502 from us. Inferring the envelope from
      // the profile name later is the derived-fact pattern that goes stale the
      // first time a profile is renamed.
      requestObjectFormat:
        wireProfileForExchange(forBytes)?.oid4vp?.requestObjectFormat ?? 'json',
      // ⚠️ The ELECTED profile, not the active one. Left reading the active
      // profile this line would report one construction beside another
      // construction's bytes, misattributing every pinned fetch — the same
      // defect class as a derived fact that goes stale beside the thing it was
      // derived from. Both this name and the `requestObjectFormat`
      // above are read from `forBytes` for that reason.
      ...(servedProfileName ? { protocolProfileName: servedProfileName } : {}),
      ...requestAttribution(c)
    })
    c.header('Cache-Control', 'no-store')

    // ⚠️ The envelope is a profile decision, and the two arms are NOT
    // equivalent. They make two different claims and the difference is the
    // whole point of this surface:
    //
    //   `json`       — the baseline construction every other delivery is
    //                  compared against. Undefined in every OID4VP version,
    //                  kept live deliberately, never deleted to "clean up".
    //   `jwt-signed` — conformant on this path, and signed elsewhere: the
    //                  bytes come back from `dcc-signing-service` and are
    //                  served VERBATIM.
    //
    // ⚠️ **There is no third arm, `jwt-unsigned` (`alg: none`), and there must
    // not be one.** A JWT envelope served from here is always a signed one, so
    // nothing downstream has to ask which kind it got. Do not put an unsigned
    // arm beside the signed one without reopening
    // `docs/adr/2026-08-25-oid4vp-request-object-envelopes.md` §2.
    //
    // ⚠️ **There is no fallback between them, on any error, ever.** A signing
    // failure raises and becomes a 502 in `withErrorHandling`. It must never
    // fall through to the JSON arm below: a delivery that quietly becomes
    // another arm changes a second variable in a comparison meant to change
    // one, and reports the wrong answer. Here it would additionally serve an
    // unsigned object under a profile whose name claims a signature. The
    // `switch`-like shape below is written so that adding a fallback means
    // deleting a `return`, not forgetting a guard.
    const request = buildAuthorizationRequest(forBytes)
    const requestObjectFormat =
      wireProfileForExchange(forBytes)?.oid4vp?.requestObjectFormat
    if (requestObjectFormat === 'jwt-signed') {
      const signed = await signRequestObject({
        exchange: forBytes,
        request,
        config: c.var.config
      })
      c.header('Content-Type', REQUEST_OBJECT_JWT_MEDIA_TYPE)
      return c.body(signed)
    }
    return c.json(request)
  })

  /*
  OID4VP 1.0 direct_post Response (§8.2). The wallet POSTs a DCQL `vp_token`
  (JSON object keyed by credential-query id) here. The handler binds it to the
  exchange (`state`/replay guard + `client_id`↔`domain`), then reuses the verify
  pipeline so the exchange finalizes exactly like the VC-API path. Accepts JSON
  or form-urlencoded. Spec-shaped errors return 400 + `Cache-Control: no-store`.

  A wallet may also POST an OID4VP error response here reporting its own failure
  (§5.10); that is accepted with a 200 and terminates the exchange. See
  `acceptWalletError` in `oid4vp/response-handler.ts`.
  */
  .post(routes.oid4vpResponse, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'verify') {
      throw new HTTPException(400, {
        message: 'OID4VP response endpoint is only available for verify exchanges'
      })
    }
    if (exchange.state === 'complete') {
      c.header('Cache-Control', 'no-store')
      return c.json(
        {
          error: 'invalid_request',
          error_description: 'This exchange has already been completed.'
        },
        400
      )
    }

    const contentType = c.req.header('content-type') ?? ''
    let body: unknown
    if (contentType.includes('application/json')) {
      try {
        body = await c.req.json()
      } catch {
        body = undefined
      }
    } else {
      body = await c.req.parseBody()
    }

    const result = await handleOid4vpResponse({
      body,
      exchange: exchange as App.ExchangeDetailVerify,
      workflow: getWorkflow('verify'),
      config: c.var.config
    })

    c.header('Cache-Control', 'no-store')
    if (!result.ok) {
      return c.json(result.body, result.status)
    }
    // The verify pipeline already persisted the finalized exchange.
    return c.json(result.response, 200)
  })

  /*
  OID4VCI 1.0 Token Endpoint (§6) — pre-authorized code grant.
  RFC 6749 form-urlencoded body. Spec-shaped error responses are
  returned with 400 + `Cache-Control: no-store`.

  Registered twice, from one handler, so the discovered route and the
  accommodated one cannot drift apart — the same reason the two discovery
  constructions share `issuerMetadataHandler`. See `routes.oid4vciTokenByConvention`.
  */
  .post(routes.oid4vciToken, tokenEndpointHandler('discovered'))
  .post(routes.oid4vciTokenByConvention, tokenEndpointHandler('by-convention'))

  /*
  OID4VCI 1.0 Nonce Endpoint (§7). Mints a single-use 5-minute
  `c_nonce`. No auth required; replaces any prior nonce on the
  exchange.
  */
  .post(routes.oid4vciNonce, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI nonce endpoint is only available for claim exchanges'
      })
    }
    const result = handleNonceRequest(exchange as App.ExchangeDetailClaim)
    await saveExchange(result.exchange)
    c.header('Cache-Control', 'no-store')
    return c.json(result.response)
  })

  /*
  OID4VCI 1.0 Credential Endpoint (§8). Validates Bearer access token
  and a `proofs.di_vp[0]` Verifiable Presentation that DIDAuth-binds
  the holder DID to the previously-issued `c_nonce`, then defers to
  the shared claim signing path. Returns the OID4VCI 1.0 §8.3 response.
  */
  .post(routes.oid4vciCredential, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message:
          'OID4VCI credential endpoint is only available for claim exchanges'
      })
    }

    const auth = c.req.header('Authorization') ?? ''
    const accessToken = auth.startsWith('Bearer ')
      ? auth.slice('Bearer '.length).trim()
      : undefined

    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      c.header('Cache-Control', 'no-store')
      return c.json(
        {
          error: 'invalid_credential_request',
          error_description: 'Credential request body must be JSON.'
        },
        400
      )
    }

    const result = await handleCredentialRequest({
      accessToken,
      body,
      exchange: exchange as App.ExchangeDetailClaim,
      workflow: getWorkflow('claim'),
      config: c.var.config
    })

    if (!result.ok) {
      c.header('Cache-Control', 'no-store')
      return c.json(result.body, result.status)
    }

    // The shared signing helper already persisted state='complete' +
    // verifiableCredential. No additional save needed.
    c.header('Cache-Control', 'no-store')
    return c.json(result.response)
  })

  // VCALM interaction URL — content-negotiated endpoint for browser and API access
  .get(routes.interaction, async (c) => {
    const result = await resolveInteraction(
      c.req.param('exchangeId')!,
      c.req.header('accept'),
      c.var.config,
      c.req.query('protocolProfile')
    )
    if (result.kind === 'html') {
      setCookie(c, 'exchange_token', result.token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: c.req.url.startsWith('https'),
        path: '/',
        maxAge: result.maxAge
      })
      return c.html(result.html)
    }
    return c.json({ protocols: result.protocols })
  })

  /*
  Record which delivery candidate the interaction page is showing.

  ⚠️ This exists because the interaction method cannot be inferred from our own
  wire. A by-value OID4VP request carries the whole authorization request inside
  the QR, so there is no `request_uri` GET and a failed scan leaves us nothing at
  all — which is exactly how a scan of the wrong interaction method goes
  unnoticed until somebody reads the pasted URL. The page is the only party that
  knows, so the page says so.

  Deliberately unauthenticated and deliberately 204: the caller is our own SPA
  reporting on an exchange whose id it already holds, the payload is one the
  service just handed it, and nothing downstream reads the result. Journalling
  is no-op unless `EXCHANGE_JOURNAL_PATH` is set.
  */
  .post(routes.interactionMethod, async (c) => {
    const body = await c.req.json().catch(() => null)
    const parsed = z
      .object({ payloadId: z.string().min(1), payload: z.string().min(1) })
      .safeParse(body)
    if (!parsed.success) {
      return c.json({ code: 400, message: 'payloadId and payload required' }, 400)
    }

    const exchange = await getExchangeDataById(c.req.param('exchangeId')!)
    const { payloadId, payload } = parsed.data
    const method = describeInteractionMethod(payload)
    console.log(
      `interaction method shown: payloadId=${payloadId} scheme=${method.scheme}` +
        `${method.delivery ? ` delivery=${method.delivery}` : ''}` +
        ` exchange=${exchange.exchangeId}`
    )

    // ⚠️ **The construction comes from the BYTES, and `source` says so.** A
    // payload that names a profile is a fact about what was on screen; a payload
    // that names none is the exchange's active construction, which is a fact
    // about a resolution. Both are true and a later reader has to be able to
    // tell them apart — so the two are recorded distinguishably rather than
    // collapsed into one field. `payloadId` is recorded beside the name as the
    // join key every recorded run cites, never as the source of it.
    const resolvedName =
      method.protocolProfile ??
      tryResolveProtocolProfile(exchange, c.var.config)?.name
    const source: App.InteractionMethodElection['source'] = method.protocolProfile
      ? 'payload'
      : 'active'

    // ⚠️ **The record takes recognised elections only; the journal takes
    // everything.** This endpoint's payload comes from the client, so without
    // this the client picks what lands on the record — `recordDiscoveryElection`
    // already refuses "an unbounded array on a record a client can grow by
    // polling", and here the client chooses the bytes as well as the timing.
    // Recognised means: byte-identical to a payload this service itself builds
    // for an offerable preset, which bounds the set by the offerable set.
    //
    // ⚠️ An unrecognised payload is journalled AND journalled as unrecognised.
    // Dropping it from the record while the journal showed it accepted would be
    // a difference no reader could see.
    let recognised = false
    if (resolvedName) {
      try {
        recognised = offerablePresets(exchange, c.var.config).some(
          (preset) => preset.payload === payload
        )
      } catch {
        // Computing the offerable set is a convenience here, not the point of
        // the request. A failure costs recognition, never the 204 below.
        recognised = false
      }
    }

    journalExchangeEvent(exchange, 'interaction-method-shown', {
      payloadId,
      ...method,
      ...(resolvedName
        ? { protocolProfileName: resolvedName, protocolProfileSource: source }
        : {}),
      recognised,
      // The full payload, not just the derived fields: the derivation is a
      // convenience for reading, and an interaction method we described wrongly
      // is precisely the case where the raw bytes are the only thing that
      // settles it.
      payload
    })

    if (recognised && resolvedName) {
      // ⚠️ A failure to record must never reach the operator. A scan must not
      // fail because the record of it could not be written — the same rule the
      // route's own docblock states about journalling, applied to the record.
      try {
        const recorded = recordInteractionMethodElection(exchange, {
          payloadId,
          protocolProfileName: resolvedName,
          source
        })
        if (recorded.isNew) await saveExchange(recorded.exchange)
      } catch (e) {
        console.error(
          `interaction method election could not be recorded for ${exchange.exchangeId}: ${
            (e as Error).message
          }`
        )
      }
    }
    return c.body(null, 204)
  })

  /*
  The launch presets this exchange may be offered under — computed, never
  persisted, and never a copy of the registry handed to the page.

  ⚠️ Unlike `interactionMethod`, this one MAY fail loudly. An interaction method
  report is an observation whose loss costs a line of evidence; a page with no
  presets has nothing to show, so the failure has to reach the UI rather than
  leaving an operator looking at an empty list wondering whether that is the
  answer.
  */
  .get(routes.interactionPresets, async (c) => {
    const exchange = await getExchangeDataById(c.req.param('exchangeId')!)
    return c.json({ presets: offerablePresets(exchange, c.var.config) })
  })

export type AppType = typeof app
