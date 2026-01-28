import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getProtocols } from '../../../../../../exchanges.js'
import { HTTPException } from 'hono/http-exception'

/**
 * GET /workflows/:workflowId/exchanges/:exchangeId/protocols
 * Returns protocols information for an exchange
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId

  // Get exchange data
  let exchangeData: App.ExchangeDetailBase
  try {
    exchangeData = await locals.ctx.exchangeService!.getExchangeData(
      exchangeId,
      workflowId
    )
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  const protocols = getProtocols(exchangeData)
  return json({ protocols })
}
