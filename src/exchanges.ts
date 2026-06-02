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
import { getWalletInteractionUrl } from './lib/wallets/index.js'
import {
  buildOpenIdCredentialOfferDeepLinkByReference,
  credentialOfferUriForExchange
} from './oid4vci/index.js'
import { HTTPException } from 'hono/http-exception'

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

export const getProtocols = (exchange: App.ExchangeDetailBase) => {
  const verifiablePresentationRequest =
    exchange.workflowId === 'verify'
      ? getVerifyVPR(exchange as App.ExchangeDetailVerify)
      : getDIDAuthVPR(exchange)
  const serviceEndpoint =
    verifiablePresentationRequest.interact.service[0].serviceEndpoint ?? ''
  const isVerify = exchange.workflowId === 'verify'
  const protocols: {
    iu: string
    vcapi: string
    lcw?: string
    OID4VCI?: string
    verifiablePresentationRequest: typeof verifiablePresentationRequest
  } = {
    iu: `${exchange.variables.exchangeHost}/interactions/${exchange.exchangeId}`,
    vcapi: serviceEndpoint,
    lcw: isVerify
      ? getWalletInteractionUrl('lcw', 'vcapiExchange', serviceEndpoint)
      : getWalletInteractionUrl('lcw', 'vcapi', serviceEndpoint, {
          challenge: exchange.variables.challenge
        }),
    verifiablePresentationRequest
    // TODO: add "OID4VP" support for forthcoming verification workflows
  }

  // OID4VCI 1.0 Pre-Authorized Code Flow is offered alongside VCALM for
  // claim exchanges. The deep link points at the credential offer URI;
  // the wallet GETs that to receive the offer JSON. The offer route
  // lazily mints the pre-authorized code on first GET, so we don't need
  // any state on the exchange for this protocol entry to be valid.
  if (exchange.workflowId === 'claim') {
    protocols.OID4VCI = buildOpenIdCredentialOfferDeepLinkByReference(
      credentialOfferUriForExchange(exchange as App.ExchangeDetailClaim)
    )
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
