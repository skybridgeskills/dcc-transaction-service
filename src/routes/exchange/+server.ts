import { json, error } from '@sveltejs/kit'
import { createExchangeBatchHelper } from './exchange-helpers.js'
import { getWorkflow } from '../../workflows.js'
import { exchangeBatchSchema } from '../../schema.js'
import { HTTPException } from 'hono/http-exception'
import { z } from 'zod'
import { zodErrorToProblemDetails } from '../../utils.js'

/**
 * POST /exchange
 * Creates a batch of exchanges for the specified workflow
 * Returns an array of wallet queries
 */
export const POST = async ({ request, locals }) => {
  const config = locals.ctx.configService.getConfig()

  // Parse and validate request body
  let inputData: unknown
  try {
    inputData = await request.json()
  } catch (e) {
    error(400, { message: 'Invalid JSON' })
  }

  // Validate with Zod schema
  let data: App.ExchangeBatch
  try {
    data = exchangeBatchSchema.parse(inputData)
  } catch (e) {
    // Handle ZodError from validation
    if (e instanceof z.ZodError) {
      const problemDetails = zodErrorToProblemDetails(e)
      error(400, {
        message: e.errors.map((err) => err.message).join(', '),
        errors: problemDetails
      })
    }
    error(400, { message: 'Validation failed' })
  }

  if (config.tenantAuthenticationEnabled && !locals.authTenant) {
    error(401, { message: 'Unauthorized' })
  }
  // If authTenant is set but doesn't match the tenant in the request body
  if (locals.authTenant && locals.authTenant.tenantName !== data.tenantName) {
    error(401, { message: 'Unauthorized' })
  }

  // Get workflow - defaults to 'didAuth' if not specified
  const workflow = getWorkflow(
    (data.workflowId ?? 'didAuth') as keyof typeof getWorkflow
  )
  if (!workflow) {
    error(400, { message: 'Invalid workflowId' })
  }

  // Create batch of exchanges
  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  try {
    const walletQueries = await createExchangeBatchHelper({
      data,
      config,
      workflow,
      exchangeService: locals.ctx.exchangeService
    })
    return json(walletQueries)
  } catch (e) {
    // Handle HTTPException from exchange creation
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    console.error('Error creating exchange batch:', e)
    error(500, { message: 'Failed to create exchange batch' })
  }
}
