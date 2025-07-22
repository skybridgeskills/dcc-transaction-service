import { saveExchange, getExchangeData } from './transactionManager.js'
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
import type { Context } from 'hono'

import { getLcwProtocol } from './protocols/lcw.js'
import { HTTPException } from 'hono/http-exception'

import { verifyDIDAuth } from './didAuth.js'

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
  config,
  workflow,
  exchange
}: {
  config: App.Config
  workflow: App.Workflow
  exchange: App.ExchangeDetailBase
}) => {
  if (['claim', 'didAuth'].includes(workflow.id)) {
    // Reply with a VPR to authenticate the wallet.
    const vpr = await getDIDAuthVPR(exchange)
    return { verifiablePresentationRequest: vpr }
  }
  if (workflow.id === 'verify') {
    const vpr = await getVerifyVPR(exchange as App.ExchangeDetailVerify)
    return { verifiablePresentationRequest: vpr, ...vpr }
  }

  // healthz/catchall
  throw new HTTPException(400, {
    message: 'Workflow is not valid for this endpoint'
  })
}

export const participateInExchange = async ({
  data,
  config,
  workflow,
  exchange
}: {
  data: any
  config: App.Config
  workflow: App.Workflow
  exchange: App.ExchangeDetailBase
}) => {
  if (!data || !Object.keys(data).length) {
    // If there is no body, this is the initial step of the exchange.
    console.log('participateWithEmptyBody')
    return participateWithEmptyBody({ config, workflow, exchange })
  }
  if (workflow.id === 'didAuth') {
    return participateInDidAuthExchange({
      data,
      exchange: exchange as App.ExchangeDetailDidAuth,
      workflow,
      config
    })
  }
  // TODO: add "OID4VCI" support (claim workflow)
  if (workflow.id === 'claim') {
    return participateInClaimExchange({
      data,
      exchange: exchange as App.ExchangeDetailClaim,
      workflow,
      config
    })
  }
  if (workflow.id === 'verify') {
    return participateInVerifyExchange({
      data,
      exchange: exchange as App.ExchangeDetailVerify,
      workflow,
      config
    })
  }
}

export const getProtocols = (exchange: App.ExchangeDetailBase) => {
  const verifiablePresentationRequest =
    exchange.workflowId === 'verify'
      ? getVerifyVPR(exchange as App.ExchangeDetailVerify)
      : getDIDAuthVPR(exchange)
  const serviceEndpoint =
    verifiablePresentationRequest.interact.service[0].serviceEndpoint ?? ''
  const protocols = {
    iu: `${serviceEndpoint}/protocols?iuv=1`,
    vcapi: serviceEndpoint,
    lcw: getLcwProtocol(exchange),
    verifiablePresentationRequest
    // TODO: add "OID4VCI" support (claim workflow)
    // TODO: add "OID4VP" support for forthcoming verification workflows
  }
  return protocols
}

export const getInteractionsForExchange = async (c: Context) => {
  const exchangeData = await getExchangeData(
    c.req.param('exchangeId'),
    c.req.param('workflowId')
  )
  if (!exchangeData) {
    c.status(404)
    return c.json({
      code: 404,
      message: 'Exchange not found'
    })
  }
  const protocols = getProtocols(exchangeData)
  return c.json({ protocols })
}
