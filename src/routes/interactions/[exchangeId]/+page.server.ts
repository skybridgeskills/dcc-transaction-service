import { redirect, error } from '@sveltejs/kit'
import { HTTPException } from 'hono/http-exception'

/**
 * Load function for /interactions/[exchangeId]
 * Handles content negotiation:
 * - If Accept: application/json or no Accept header → redirect to protocols JSON route
 * - If Accept: text/html → load exchange data for HTML page
 */
export const load = async ({ locals, params, request }) => {
  const exchangeId = params.exchangeId

  if (!locals.ctx.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  // Get exchange data by ID only (no workflowId validation)
  let exchangeData: App.ExchangeDetailBase
  try {
    exchangeData = await locals.ctx.exchangeService.getExchangeById(exchangeId)
  } catch (e) {
    if (e instanceof HTTPException) {
      error(e.status, { message: e.message })
    }
    error(404, { message: 'Exchange not found' })
  }

  // Check Accept header for content negotiation
  const acceptHeader = request.headers.get('accept') || ''
  const acceptsJson =
    acceptHeader.includes('application/json') || acceptHeader === ''
  const acceptsHtml = acceptHeader.includes('text/html')

  // If JSON is requested or no Accept header, redirect to protocols route
  if (acceptsJson && !acceptsHtml) {
    throw redirect(
      302,
      `/workflows/${exchangeData.workflowId}/exchanges/${exchangeId}/protocols`
    )
  }

  // For HTML requests, return exchange data
  // Note: exchangeService is not serializable, so we'll create it in the page component
  return {
    exchange: exchangeData,
    exchangeId,
    workflowId: exchangeData.workflowId
  }
}
