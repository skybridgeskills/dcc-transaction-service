import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getWorkflow } from '../../../../workflows.js'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { zodErrorToProblemDetails } from '../../../../utils.js'

/**
 * POST /workflows/:workflowId/exchanges
 * Creates a new exchange for the specified workflow
 */
export const POST: RequestHandler = async ({ request, params, locals }) => {
  const config = locals.ctx.configService.getConfig()
  const workflowId = params.workflowId

  // Get workflow - throws 404 if not found
  const workflow = getWorkflow(workflowId as keyof typeof getWorkflow)
  if (!workflow) {
    error(404, { message: 'Workflow not found' })
  }

  // Parse request body
  let inputData: unknown
  try {
    inputData = await request.json()
  } catch (e) {
    error(400, { message: 'Invalid JSON' })
  }

  // Check tenant authentication if enabled (before validation)
  const authEnabled = config.tenantAuthenticationEnabled
  if (authEnabled && locals.authTenant) {
    const input = inputData as { variables?: { tenantName?: string } }
    if (
      input.variables?.tenantName &&
      locals.authTenant.tenantName !== input.variables.tenantName
    ) {
      error(401, { message: 'Unauthorized' })
    }
  }

  // Create exchange
  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  try {
    const exchange = await locals.ctx.exchangeService.createExchange(
      inputData as App.ExchangeCreateInput,
      config,
      workflow
    )
    const protocols = locals.ctx.exchangeService.getExchangeProtocols(exchange)
    return json(protocols)
  } catch (e) {
    // Handle ZodError from workflow-specific validation
    if (e instanceof z.ZodError) {
      const problemDetails = zodErrorToProblemDetails(e)
      error(400, {
        message: e.errors.map((err) => err.message).join(', '),
        errors: problemDetails
      })
    }
    // Handle HTTPException from exchange creation
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    console.error('Error creating exchange:', e)
    error(500, { message: 'Failed to create exchange' })
  }
}
