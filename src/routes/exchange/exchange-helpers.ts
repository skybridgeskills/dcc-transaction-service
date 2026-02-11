/**
 * Helper functions for exchange route handlers
 */

import type { ExchangeService } from '../../lib/services/exchange-service.js'
import { HttpError } from '../../lib/http-error.js'

/**
 * Creates a batch of exchanges and returns wallet queries
 * Used by the legacy /exchange endpoint
 */
export const createExchangeBatchHelper = async ({
  data,
  config,
  workflow,
  exchangeService
}: {
  data: App.ExchangeBatch
  config: App.Config
  workflow: App.Workflow
  exchangeService: ExchangeService
}) => {
  // Transform each batch item into ExchangeCreateInput and create exchanges
  const exchangeRequests: App.ExchangeDetailBase[] = []

  switch (workflow.id) {
    case 'claim':
      for (const d of data.data) {
        const input: App.ExchangeCreateInput = {
          variables: {
            tenantName: data.tenantName,
            exchangeHost: data.exchangeHost,
            ...(data.batchId && { batchId: data.batchId }),
            ...(d.vc && { vc: d.vc }),
            ...(d.subjectData && { subjectData: d.subjectData }),
            ...(d.retrievalId && { retrievalId: d.retrievalId }),
            ...(d.metadata && { metadata: d.metadata })
          }
        }
        const exchange = await exchangeService.createExchange(
          input,
          config,
          workflow
        )
        exchangeRequests.push(exchange)
      }
      break
    case 'didAuth':
      for (const d of data.data) {
        const input: App.ExchangeCreateInput = {
          variables: {
            tenantName: data.tenantName,
            exchangeHost: data.exchangeHost,
            ...(data.batchId && { batchId: data.batchId }),
            ...(d.redirectUrl && { redirectUrl: d.redirectUrl }),
            ...(d.retrievalId && { retrievalId: d.retrievalId })
          }
        }
        const exchange = await exchangeService.createExchange(
          input,
          config,
          workflow
        )
        exchangeRequests.push(exchange)
      }
      break
    case 'verify':
      for (const d of data.data) {
        // For verify workflow, use item directly as it's already in the correct format
        const input = d as unknown as App.ExchangeCreateInput
        const exchange = await exchangeService.createExchange(
          input,
          config,
          workflow
        )
        exchangeRequests.push(exchange)
      }
      break
    case 'healthz':
      throw new HttpError(
        400,
        'Workflow healthz is not valid for this endpoint'
      )
    default:
      throw new HttpError(400, `Unknown workflow: ${workflow.id}`)
  }

  // Transform exchanges into wallet queries
  const walletQueries = exchangeRequests.map((e) => {
    const protocols = exchangeService.getExchangeProtocols(e)
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
