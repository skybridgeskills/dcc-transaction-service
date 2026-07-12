import { Hono, type Context } from 'hono'
import { logger } from 'hono/logger'
import { cors } from 'hono/cors'
import { createMiddleware } from 'hono/factory'
import {
  createExchangeBatch,
  createExchangeVcapi,
  getInteractionsForExchange,
  participateInExchange
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
  buildAuthorizationRequest,
  ensureOid4vpState,
  handleOid4vpResponse
} from './oid4vp/index.js'
import {
  authenticateTenantMiddleware,
  authenticateExchangeOrTenantMiddleware
} from './auth.js'
import { healthCheck } from './health.js'
import { HTTPException } from 'hono/http-exception'
import * as schema from './schema.js'
import { validator } from 'hono/validator'
import z from 'zod'
import { JSONObject } from 'hono/utils/types'
import { getWorkflow } from './workflows.js'
import { getConfig } from './config.js'
import { getExchangeData, saveExchange } from './transactionManager.js'
import { resolveInteraction } from './interactions.js'
import { sweepIfTimedOut } from './lib/verify-task/sweep-verify-task.js'
import { resolveExchangeTenant } from './lib/tenant/resolve-exchange-tenant.js'
import { setCookie } from 'hono/cookie'
import { serveStatic } from '@hono/node-server/serve-static'
import { handleOAuthTokenPost } from './oauth/token.js'
import { oauthAuthorizationServerMetadata } from './oauth/metadata.js'

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
  exchangeBatchCreate: '/exchange',
  legacyExchangeDetail: '/exchange/:exchangeId', // This might not be used anymore if it is not referenced by the exchange creation
  exchangeCreate: '/workflows/:workflowId/exchanges',
  exchangeDetail: '/workflows/:workflowId/exchanges/:exchangeId',
  protocols: '/workflows/:workflowId/exchanges/:exchangeId/protocols',
  interaction: '/interactions/:exchangeId',
  // OID4VCI 1.0 Pre-Authorized Code Flow (per-exchange scope).
  oid4vciCredentialOffer:
    '/workflows/:workflowId/exchanges/:exchangeId/openid/credential-offer',
  oid4vciToken: '/workflows/:workflowId/exchanges/:exchangeId/openid/token',
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
    '/.well-known/oauth-authorization-server/workflows/:workflowId/exchanges/:exchangeId'
}

export const app = new Hono()

  .notFound((c) => {
    return c.json({ code: 404, message: 'Not found' }, 404)
  })
  .onError(handleErrors)

  .use(logger())
  .use(cors())
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
        await participateInExchange({
          data: null,
          config: c.var.config,
          workflow: c.var.workflow!,
          exchange
        })
      )
    }
  )

  // VC-API 0.7 as of 2025-06-08
  .post(
    routes.exchangeDetail,
    validator('json', validateJson),
    addWorkflowByParam,
    async (c) => {
      const exchange = await getExchangeData(
        c.req.param('exchangeId')!,
        c.var.workflow.id
      )
      return c.json(
        await participateInExchange({
          data: c.req.valid('json'),
          config: c.var.config,
          workflow: c.var.workflow,
          exchange
        })
      )
    }
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
  .get(routes.oid4vciIssuerMetadata, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(404, { message: 'Unknown exchange' })
    }
    return c.json(
      buildIssuerMetadata(exchange as App.ExchangeDetailClaim, c.var.config)
    )
  })

  /*
  RFC 8414 OAuth Authorization Server Metadata, per-exchange. Distinct from the
  global `/.well-known/oauth-authorization-server` which serves tenant-API
  metadata. This advertises the per-exchange OID4VCI Token Endpoint and the
  `urn:ietf:params:oauth:grant-type:pre-authorized_code` grant type.
  */
  .get(routes.oid4vciAuthorizationServerMetadata, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(404, { message: 'Unknown exchange' })
    }
    return c.json(buildOid4vciAsMetadata(exchange as App.ExchangeDetailClaim))
  })

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
  .get(routes.oid4vpRequest, async (c) => {
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
    c.header('Cache-Control', 'no-store')
    return c.json(buildAuthorizationRequest(ensured.exchange))
  })

  /*
  OID4VP 1.0 direct_post Response (§8.2). The wallet POSTs a DCQL `vp_token`
  (JSON object keyed by credential-query id) here. The handler binds it to the
  exchange (`state`/replay guard + `client_id`↔`domain`), then reuses the verify
  pipeline so the exchange finalizes exactly like the VC-API path. Accepts JSON
  or form-urlencoded. Spec-shaped errors return 400 + `Cache-Control: no-store`.
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
  */
  .post(routes.oid4vciToken, async (c) => {
    const exchange = await getExchangeData(
      c.req.param('exchangeId')!,
      c.req.param('workflowId')!
    )
    if (exchange.workflowId !== 'claim') {
      throw new HTTPException(400, {
        message: 'OID4VCI token endpoint is only available for claim exchanges'
      })
    }
    const body = await c.req.parseBody()
    const result = handleTokenRequest(
      body,
      exchange as App.ExchangeDetailClaim
    )
    if (!result.ok) {
      c.header('Cache-Control', 'no-store')
      return c.json(result.body, result.status)
    }
    await saveExchange(result.exchange)
    c.header('Cache-Control', 'no-store')
    return c.json(result.response)
  })

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
      c.var.config
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

export type AppType = typeof app
