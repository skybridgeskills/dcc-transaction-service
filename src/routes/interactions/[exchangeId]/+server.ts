import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getProtocols } from '../../../exchanges.js'
import { HTTPException } from 'hono/http-exception'

/**
 * GET /interactions/:exchangeId
 * Canonical interactions endpoint per VCALM spec
 * Returns protocols for an exchange without requiring workflowId in the URL
 */
export const GET: RequestHandler = async ({ locals, params }) => {
  const exchangeId = params.exchangeId

  // Get exchange data by ID only (no workflowId validation)
  let exchangeData: App.ExchangeDetailBase
  try {
    exchangeData = await locals.ctx.exchangeService!.getExchangeById(exchangeId)
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  const protocols = getProtocols(exchangeData)
  return json({ protocols })
}
