import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { HttpError } from '../../../../../../../lib/http-error.js'
import { getApp } from '../../../../../../../lib/app/app-context.js'
import type { OID4VCI } from '../../../../../../../lib/protocols/oid4vci/types.js'

/**
 * POST /workflows/:workflowId/exchanges/:exchangeId/openid/credential
 * Returns OID4VCI credential response
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  // Extract access token from Authorization header
  const authHeader = request.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    error(401, {
      message: 'Authorization header with Bearer token is required'
    })
  }
  const accessToken = authHeader.substring(7)

  // Parse credential request body
  let credentialRequest: OID4VCI.CredentialRequest
  try {
    credentialRequest = await request.json()
  } catch {
    error(400, { message: 'Invalid JSON in request body' })
  }

  if (!credentialRequest.format || !credentialRequest.types) {
    error(400, {
      message: 'credential request must include format and types'
    })
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

  // Get config
  const app = getApp()
  if (!app.configService) {
    error(500, { message: 'ConfigService not available' })
  }
  const config = await app.configService.getConfig()

  // Get credential
  try {
    const credentialResponse =
      await locals.ctx.exchangeService.getOid4vciCredential(
        exchangeId,
        accessToken,
        credentialRequest,
        config
      )
    return json(credentialResponse)
  } catch (e) {
    if (e instanceof HttpError) {
      error(e.status, { message: e.message })
    }
    error(500, { message: 'Failed to issue credential' })
  }
}
