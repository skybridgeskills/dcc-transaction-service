import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { HTTPException } from 'hono/http-exception'

/**
 * GET /workflows/:workflowId/exchanges/:exchangeId/openid/authorization
 * Processes OID4VCI authorization request with pre-authorized code
 */
export const GET: RequestHandler = async ({ locals, params, url }) => {
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId
  const preAuthorizedCode = url.searchParams.get('pre-authorized_code')

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  if (!preAuthorizedCode) {
    error(400, { message: 'pre-authorized_code query parameter is required' })
  }

  // Get exchange data to validate it exists
  try {
    await locals.ctx.exchangeService.getExchangeData(exchangeId, workflowId)
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  // Process authorization
  try {
    const authResponse =
      await locals.ctx.exchangeService.getOid4vciAuthorization(
        exchangeId,
        preAuthorizedCode
      )
    return json(authResponse)
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(500, { message: 'Failed to process authorization' })
  }
}
