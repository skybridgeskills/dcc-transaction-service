import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { HttpError } from '../../../../../../../lib/http-error.js'

/**
 * POST /workflows/:workflowId/exchanges/:exchangeId/openid/token
 * Returns OID4VCI token response for authorization code or pre-authorized code grant
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  // Parse request body
  let body: {
    grant_type: string
    code?: string
    'pre-authorized_code'?: string
    redirect_uri?: string
    code_verifier?: string
  }
  try {
    body = await request.json()
  } catch {
    error(400, { message: 'Invalid JSON in request body' })
  }

  if (!body.grant_type) {
    error(400, { message: 'grant_type is required' })
  }

  // Get exchange data to validate it exists
  try {
    await locals.ctx.exchangeService.getExchangeData(exchangeId, workflowId)
  } catch (e) {
    if (e instanceof HttpError) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  // Get token
  try {
    const tokenResponse = await locals.ctx.exchangeService.getOid4vciToken(
      exchangeId,
      body.grant_type,
      body.code,
      body['pre-authorized_code']
    )
    return json(tokenResponse)
  } catch (e) {
    if (e instanceof HttpError) {
      error(e.status, { message: e.message })
    }
    error(500, { message: 'Failed to generate token' })
  }
}
