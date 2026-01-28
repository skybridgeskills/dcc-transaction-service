import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { HTTPException } from 'hono/http-exception'
import { getApp } from '../../../../../../../lib/app/app-context.js'

/**
 * GET /workflows/:workflowId/exchanges/:exchangeId/openid/credential-offer
 * Returns OID4VCI credential offer for a claim exchange
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  // Get exchange data
  let exchangeData: App.ExchangeDetailBase
  try {
    exchangeData = await locals.ctx.exchangeService.getExchangeData(
      exchangeId,
      workflowId
    )
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  // Validate it's a claim exchange
  if (exchangeData.workflowId !== 'claim') {
    error(400, {
      message: 'OID4VCI credential offer is only available for claim exchanges'
    })
  }

  // Get config
  const app = getApp()
  if (!app.configService) {
    error(500, { message: 'ConfigService not available' })
  }
  const config = await app.configService.getConfig()

  // Get credential offer
  try {
    const credentialOffer =
      await locals.ctx.exchangeService.getOid4vciCredentialOffer(
        exchangeData,
        config
      )
    return json(credentialOffer)
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(500, { message: 'Failed to generate credential offer' })
  }
}
