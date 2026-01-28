import { json, error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createExchangeBatch } from '../../exchanges.js'
import { getWorkflow } from '../../workflows.js'
import { exchangeBatchSchema } from '../../schema.js'
import { HTTPException } from 'hono/http-exception'

/**
 * POST /exchange
 * Creates a batch of exchanges for the specified workflow
 * Returns an array of wallet queries
 */
export const POST: RequestHandler = async ({ request, locals }) => {
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
    if (e instanceof Error && 'errors' in e) {
      // Zod validation error
      const zodError = e as {
        errors: Array<{ message: string; path: string[] }>
      }
      error(400, {
        message: zodError.errors.map((err) => err.message).join(', '),
        details: zodError.errors
      })
    }
    error(400, { message: 'Validation failed' })
  }

  // Check tenant authentication if enabled
  const authEnabled = config.tenantAuthenticationEnabled
  const authHeader = request.headers.get('authorization')

  if (authEnabled) {
    // If Authorization header is present but authTenant is not set, authentication failed
    if (authHeader && !locals.authTenant) {
      error(401, { message: 'Unauthorized' })
    }
    // If authTenant is set but doesn't match the tenant in the request body
    if (locals.authTenant && locals.authTenant.tenantName !== data.tenantName) {
      error(401, { message: 'Unauthorized' })
    }
  }

  // Get workflow - defaults to 'didAuth' if not specified
  const workflow = getWorkflow(
    (data.workflowId ?? 'didAuth') as keyof typeof getWorkflow
  )
  if (!workflow) {
    error(400, { message: 'Invalid workflowId' })
  }

  // Create batch of exchanges
  try {
    const walletQueries = await createExchangeBatch({
      data,
      config,
      workflow
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
