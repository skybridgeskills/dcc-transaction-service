import { saveExchange, getExchangeData } from './transactionManager.js'
import { sweepIfTimedOut } from './lib/verify-task/sweep-verify-task.js'
import {
  createExchangeClaim,
  participateInClaimExchange,
  validateExchangeClaim
} from './workflows/claimWorkflow.js'
import {
  createExchangeDidAuth,
  getDIDAuthVPR,
  participateInDidAuthExchange,
  validateExchangeDidAuth
} from './workflows/didAuthWorkflow.js'
import {
  createExchangeVerify,
  getVerifyVPR,
  participateInVerifyExchange,
  validateExchangeVerify
} from './workflows/verifyWorkflow.js'
import { walletLinkFor } from './lib/wallets/index.js'
import {
  buildOpenIdCredentialOfferDeepLinkByReference,
  credentialOfferUriForExchange
} from './oid4vci/index.js'
import {
  buildAuthorizationRequest,
  buildOid4vpDeepLink,
  buildOid4vpDeepLinkByValue,
  clientIdForExchange,
  requestUriForExchange,
  resolveDelivery
} from './oid4vp/index.js'
import { HTTPException } from 'hono/http-exception'
import { wireProfileForExchange } from './protocol-profiles/for-exchange.js'

/** Allows the creation of one or a batch of exchanges for a particular tenant. */
export const createExchangeBatch = async ({
  data,
  config,
  workflow
}: {
  data: App.ExchangeBatch
  config: App.Config
  workflow: App.Workflow
}) => {
  const exchangeRequests: App.ExchangeDetailBase[] = data.data.map((d) => {
    let exchange: App.ExchangeDetailBase
    let validated
    switch (workflow.id) {
      case 'claim':
        validated = validateExchangeClaim({
          variables: {
            tenantName: data.tenantName,
            exchangeHost: data.exchangeHost,
            batchId: data.batchId,
            ...(d.vc && { vc: d.vc }),
            ...(d.subjectData && { subjectData: d.subjectData }),
            ...(d.retrievalId && { retrievalId: d.retrievalId }),
            ...(d.metadata && { metadata: d.metadata })
          }
        })
        exchange = createExchangeClaim({
          data: validated,
          config
        })
        break
      case 'didAuth':
        validated = validateExchangeDidAuth({
          variables: {
            tenantName: data.tenantName,
            exchangeHost: data.exchangeHost,
            batchId: data.batchId,
            ...(d.redirectUrl && { redirectUrl: d.redirectUrl }),
            ...(d.retrievalId && { retrievalId: d.retrievalId })
          }
        })
        exchange = createExchangeDidAuth({
          data: validated,
          config,
          workflow
        })
        break
      case 'verify':
        validated = validateExchangeVerify(d)
        exchange = createExchangeVerify({
          data: validated,
          config,
          workflow
        })
        break
      case 'healthz':
        throw new HTTPException(400, {
          message: 'Workflow healthz is not valid for this endpoint'
        })
    }
    return exchange
  })

  for (const ex of exchangeRequests) {
    await saveExchange(ex)
  }
  const walletQueries = exchangeRequests.map((e) => {
    const protocols = getProtocols(e)
    return {
      iu: protocols.iu,
      retrievalId: e.variables.retrievalId,
      directDeepLink: protocols.lcw ?? '',
      vprDeepLink: protocols.lcw ?? '',
      chapiVPR: protocols.verifiablePresentationRequest,
      metadata: e.variables.metadata
    }
  })
  return walletQueries
}

export const createExchangeVcapi = async ({
  data,
  config,
  workflow
}: {
  data: App.ExchangeCreateInput
  config: App.Config
  workflow: App.Workflow
}) => {
  let exchange: App.ExchangeDetailBase
  let validated

  switch (workflow.id) {
    case 'claim':
      validated = validateExchangeClaim(data)
      exchange = await createExchangeClaim({
        data: validated,
        config
      })
      break
    case 'didAuth':
      exchange = await createExchangeDidAuth({
        data,
        config,
        workflow
      })
      break
    case 'verify':
      validated = validateExchangeVerify(data)
      exchange = await createExchangeVerify({
        data: validated,
        config,
        workflow
      })
      break
    case 'healthz':
      throw new HTTPException(400, {
        message: 'Workflow healthz is not valid for this endpoint'
      })
  }

  await saveExchange(exchange)
  return getProtocols(exchange)
}

const participateWithEmptyBody = async ({
  config: _config,
  workflow,
  exchange
}: {
  config: App.Config
  workflow: App.Workflow
  exchange: App.ExchangeDetailBase
}) => {
  let vpr
  if (['claim', 'didAuth'].includes(workflow.id)) {
    vpr = getDIDAuthVPR(exchange)
  } else if (workflow.id === 'verify') {
    vpr = getVerifyVPR(exchange as App.ExchangeDetailVerify)
  } else {
    throw new HTTPException(400, {
      message: 'Workflow is not valid for this endpoint'
    })
  }

  if (exchange.state === 'pending') {
    exchange.state = 'active'
    await saveExchange(exchange)
  }

  return { verifiablePresentationRequest: vpr }
}

export const participateInExchange = async ({
  data,
  config,
  workflow,
  exchange
}: {
  data: Record<string, unknown> | null | undefined
  config: App.Config
  workflow: App.Workflow
  exchange: App.ExchangeDetailBase
}) => {
  if (exchange.state === 'complete') {
    throw new HTTPException(400, {
      message: 'Exchange has already been completed.'
    })
  }

  // If there is no body, this is the initial step of the exchange.
  if (!data || !Object.keys(data).length) {
    return participateWithEmptyBody({ config, workflow, exchange })
  }

  // Otherwise, the user is submitting data to participate and potentially
  // complete the exchange.
  switch (workflow.id) {
    case 'didAuth':
      return participateInDidAuthExchange({
        data,
        exchange: exchange as App.ExchangeDetailDidAuth,
        workflow,
        config
      })
    case 'claim':
      return participateInClaimExchange({
        data,
        exchange: exchange as App.ExchangeDetailClaim,
        workflow,
        config
      })
    case 'verify':
      return participateInVerifyExchange({
        data,
        exchange: exchange as App.ExchangeDetailVerify,
        workflow,
        config
      })
    default:
      throw new HTTPException(404, { message: 'Workflow not found' })
  }
}

/**
 * The key sets emitted when no profile names any — i.e. every deployment
 * today.
 *
 * ⚠️ **Both spellings go out by default, not just to profiles that ask.** VCALM
 * advises implementers to use the versioned variants and keeps the unversioned
 * ones as *"deprecated ... indefinitely retained for backwards compatibility"*,
 * so serving both is the additive move: a wallet reading either finds the same
 * bytes, and nothing that read the old spelling stops working.
 *
 * ⚠️ Deprecated first, deliberately — it is the id every recorded run cites,
 * the id the method picker shows and the id `interaction-method-shown` records.
 * Leading with the versioned spelling would split one construction's records
 * across two names.
 *
 * Stated here AND in the authored profiles, like every other historical default
 * during this migration; the knob retirement collapses the two.
 */
const DEFAULT_OID4VP_KEYS = ['OID4VP', 'oid4vp-1.0']
const DEFAULT_OID4VCI_KEYS = ['OID4VCI', 'oid4vci-1.0']

export const getProtocols = (
  exchange: App.ExchangeDetailBase,
  /**
   * A render-time protocol profile election to carry on the two FETCHED URLs —
   * the interaction URL and `request_uri`.
   *
   * ⚠️ **Only the fetched URLs, because only they are re-read by this
   * service.** A bare VC-API URL or a wallet convenience link carries no
   * construction, so a pin on one would be a name with nothing behind it. Those
   * interaction methods simply do not vary by profile — and
   * `protocol-profiles/offerable.ts` relies on exactly that: it dedupes
   * candidates on the built bytes, so an interaction method the pin cannot ride
   * collapses to one option without anybody listing which interaction methods
   * those are.
   *
   * ⚠️ **Absent by default, and every existing caller omits it**, so no
   * construction moves. The goldens are the guarantee.
   */
  { electionPin }: { electionPin?: string } = {}
) => {
  const verifiablePresentationRequest =
    exchange.workflowId === 'verify'
      ? getVerifyVPR(exchange as App.ExchangeDetailVerify)
      : getDIDAuthVPR(exchange)
  // ⚠️ `vcapi` is the FIRST `interact.service` entry's endpoint, so the order a
  // profile states for `interactServices` decides it. An entry that carries no
  // endpoint (`CredentialHandlerService`) placed first would empty this key —
  // which is why the order is a stated profile field and not a presentational
  // detail. No profile does that today.
  // ⚠️ `interact` itself is absent when a profile states no services — some
  // verifiers omit the member entirely, and being able to reproduce that is
  // the point of the field. `coherence.ts` refuses a profile that drops the
  // services while still offering a `vcapi` key, so this empty string is
  // reachable only alongside an envelope that offers no such key.
  const firstService = verifiablePresentationRequest.interact?.service[0]
  const serviceEndpoint =
    firstService && 'serviceEndpoint' in firstService
      ? (firstService.serviceEndpoint ?? '')
      : ''
  const isVerify = exchange.workflowId === 'verify'
  const envelope = wireProfileForExchange(exchange)?.envelope

  /**
   * Write one construction under every key the profile names for it.
   *
   * ⚠️ **Every key carrying a construction gets the SAME string**, so a wallet
   * reading either spelling finds identical bytes. That is what makes adding
   * the versioned VCALM spellings additive rather than a second construction.
   * A key list that is empty omits the construction from the envelope entirely.
   */
  const protocols: App.ExchangeProtocols = {} as App.ExchangeProtocols
  const put = (
    keys: string[] | undefined,
    fallback: string[],
    value: string | undefined
  ): void => {
    if (value === undefined) return
    for (const key of keys ?? fallback) protocols[key] = value
  }

  put(
    envelope?.interactionUrlKeys,
    ['iu'],
    `${exchange.variables.exchangeHost}/interactions/${exchange.exchangeId}?iuv=1${
      electionPin ? `&protocolProfile=${encodeURIComponent(electionPin)}` : ''
    }`
  )
  put(envelope?.vcapiKeys, ['vcapi'], serviceEndpoint)
  /**
   * ACCOMMODATION — the endpoint the wallet-convenience link points at on a
   * claim exchange: the `bare-vp` doorway, not the strict participate route.
   * See `docs/accommodations.md` (`bare-vp-participate-response`) and
   * `routes.bareVpParticipate`.
   *
   * ⚠️ **`vcapi` above and the interaction URL are deliberately NOT repointed.**
   * A VCALM client still reaches the strict route and still receives
   * `{ verifiablePresentation }`. The strict alternative staying live is what
   * makes this an accommodation rather than a rewrite.
   *
   * ⚠️ **Claim only.** `participateInDidAuthExchange` returns `{ redirectUrl }`
   * — there is no presentation to serve bare, so the doorway would have nothing
   * to do and `didauth-default.json` must not move. `verify` takes the other
   * construction entirely (`protocols-json-query`, at a different LCW path).
   *
   * ⚠️ **Derived from `serviceEndpoint`, never stated a second time.** A second
   * place the exchange address is spelled is a second place it can disagree.
   * Empty stays empty: a profile that puts a service carrying no endpoint first
   * already yields `''` here, and appending to that would invent a URL.
   */
  const walletConvenienceEndpoint =
    exchange.workflowId === 'claim' && serviceEndpoint
      ? `${serviceEndpoint}/bare-vp`
      : serviceEndpoint
  // ⚠️ The `lcw` key is a GRANDFATHERED legacy protocol key — not a VCALM
  // protocol, and the one place a product's own link rides in the envelope.
  // Which product is legacy and decided here; which SHAPE is a profile field;
  // where that shape points is product identity, in the wallet table.
  put(
    envelope?.walletConvenienceKeys,
    ['lcw'],
    walletLinkFor(
      'lcw',
      envelope?.walletConvenienceConstruction ??
        (isVerify ? 'protocols-json-query' : 'issuer-auth-challenge-query'),
      {
        serviceEndpoint: walletConvenienceEndpoint,
        challenge: exchange.variables.challenge
      }
    )
  )
  if (envelope?.emitVerifiablePresentationRequest ?? true) {
    protocols.verifiablePresentationRequest = verifiablePresentationRequest
  }

  // OID4VCI 1.0 Pre-Authorized Code Flow is offered alongside VCALM for
  // claim exchanges. The deep link points at the credential offer URI;
  // the wallet GETs that to receive the offer JSON. The offer route
  // lazily mints the pre-authorized code on first GET, so we don't need
  // any state on the exchange for this protocol entry to be valid.
  if (exchange.workflowId === 'claim') {
    put(
      envelope?.oid4vciKeys,
      DEFAULT_OID4VCI_KEYS,
      buildOpenIdCredentialOfferDeepLinkByReference(
        credentialOfferUriForExchange(exchange as App.ExchangeDetailClaim)
      )
    )
  }

  // OID4VP 1.0 verifier binding is offered alongside VC-API / CHAPI for
  // verify exchanges, in one of two deliveries (`oid4vp/deep-link.ts`).
  //
  // BY VALUE — every parameter inline. The only conformant delivery under the
  // `redirect_uri` client_id prefix. Requires `state` to exist already, which
  // `createExchangeVerify` guarantees for this arm.
  //
  // BY REFERENCE (default) — `client_id` + `request_uri`; the wallet GETs that
  // to receive the request JSON, and the request route lazily mints the
  // single-use `state` on first GET, so no exchange state need be persisted
  // for this entry to be valid.
  if (isVerify) {
    const verify = exchange as App.ExchangeDetailVerify
    if (resolveDelivery(verify) === 'by-value') {
      if (!verify.variables.oid4vp?.state) {
        // Unreachable via `createExchangeVerify`, which mints for this arm.
        // Loud rather than silently degrading to by-reference: a delivery that
        // quietly becomes the other arm changes a second variable in a
        // comparison meant to change one, and reports the wrong answer. This
        // whole build exists to stop exactly that.
        throw new Error(
          `Exchange ${verify.exchangeId} requests by-value OID4VP delivery but has no oid4vp.state; it was created outside createExchangeVerify.`
        )
      }
      put(
        envelope?.oid4vpKeys,
        DEFAULT_OID4VP_KEYS,
        buildOid4vpDeepLinkByValue(buildAuthorizationRequest(verify))
      )
    } else {
      put(
        envelope?.oid4vpKeys,
        DEFAULT_OID4VP_KEYS,
        buildOid4vpDeepLink({
          clientId: clientIdForExchange(verify),
          requestUri: requestUriForExchange(verify, electionPin)
        })
      )
    }
  }

  return protocols
}

export const getInteractionsForExchange = async (
  exchangeId: string,
  workflowId: string,
  config: App.Config
) => {
  try {
    const loaded = await getExchangeData(exchangeId, workflowId)
    // Route through the sweep so a polling client picks up an
    // expired async verify-task attempt naturally. Non-verify and
    // healthy-verify exchanges round-trip unchanged.
    const exchangeData = await sweepIfTimedOut(loaded, config)
    return { protocols: getProtocols(exchangeData) }
  } catch (e) {
    if (e instanceof HTTPException && e.status === 404) {
      return null
    }
    throw e
  }
}
