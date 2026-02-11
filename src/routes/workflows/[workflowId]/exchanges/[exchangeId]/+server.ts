import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getWorkflow } from '../../../../../workflows.js'
import { HttpError } from '../../../../../lib/http-error.js'

/**
 * POST /workflows/:workflowId/exchanges/:exchangeId
 * Handles exchange participation (both VPR request and participation response)
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const config = locals.ctx.configService.getConfig()
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId

  // Get workflow - throws 404 if not found
  const workflow = getWorkflow(workflowId as keyof typeof getWorkflow)
  if (!workflow) {
    error(404, { message: 'Workflow not found' })
  }

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  // Get exchange data
  let exchange: App.ExchangeDetailBase
  try {
    exchange = await locals.ctx.exchangeService.getExchangeData(
      exchangeId,
      workflowId
    )
  } catch (e) {
    if (e instanceof HttpError) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  // Parse request body (may be empty for VPR request)
  // participateInExchange checks for !data || !Object.keys(data).length
  let data: unknown = undefined
  const contentType = request.headers.get('content-type')

  // Only attempt parsing if Content-Type suggests JSON
  if (contentType && contentType.includes('application/json')) {
    try {
      const parsed = await request.json()
      // Treat null or empty object (but not arrays) as empty body
      if (
        parsed === null ||
        (typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.keys(parsed).length === 0)
      ) {
        data = undefined
      } else {
        data = parsed
      }
    } catch (e) {
      // SyntaxError indicates empty body or invalid JSON
      // For empty body (VPR request), this is expected and we treat as undefined
      if (e instanceof SyntaxError) {
        data = undefined
      } else {
        // Re-throw unexpected errors
        throw e
      }
    }
  }

  // Participate in exchange
  try {
    const result = await locals.ctx.exchangeService.participateInExchange(
      data,
      exchange,
      workflow,
      config
    )
    return json(result)
  } catch (e) {
    if (e instanceof HttpError) {
      error(e.status, { message: e.message })
    }
    console.error('Error participating in exchange:', e)
    error(500, { message: 'Failed to participate in exchange' })
  }
}

/**
 * GET /workflows/:workflowId/exchanges/:exchangeId
 * Returns the current state of an exchange
 */
export const GET: RequestHandler = async ({ params, locals }) => {
  const config = locals.ctx.configService.getConfig()
  const workflowId = params.workflowId
  const exchangeId = params.exchangeId

  // Get workflow - throws 404 if not found
  const workflow = getWorkflow(workflowId as keyof typeof getWorkflow)
  if (!workflow) {
    error(404, { message: 'Workflow not found' })
  }

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  // Get exchange data
  let exchange: App.ExchangeDetailBase
  try {
    exchange = await locals.ctx.exchangeService.getExchangeState(
      exchangeId,
      workflowId
    )
  } catch (e) {
    if (e instanceof HttpError) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  // Check tenant authentication if enabled
  const authEnabled = config.tenantAuthenticationEnabled
  if (
    authEnabled &&
    (!locals.authTenant ||
      locals.authTenant.tenantName !== exchange?.tenantName)
  ) {
    error(401, { message: 'Unauthorized' })
  }

  return json(exchange)
}
