import { json, error } from '@sveltejs/kit'
import { getApp } from '../../lib/app/app-context.js'
import { HttpError } from '../../lib/http-error.js'

export async function GET() {
  const app = getApp()
  const config = app.configService.getConfig()

  if (!app.exchangeService) {
    error(500, { message: 'ExchangeService not available' })
  }

  try {
    const timestamp = Date.now()
    const success = await app.exchangeService.saveExchange({
      exchangeId: `healthz-${timestamp}`,
      workflowId: 'healthz',
      tenantName: 'healthz',
      expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
      state: 'pending' as const,
      variables: {
        exchangeHost: '',
        challenge: ''
      }
    })

    if (!success) {
      throw new Error('Failed to save exchange to Keyv')
    }

    // Wait double the write delay to ensure the exchange is persisted
    await new Promise((resolve) =>
      setTimeout(resolve, 4 * config.keyvWriteDelayMs)
    )
    const result = await app.exchangeService.getExchangeData(
      `healthz-${timestamp}`,
      'healthz'
    )
    if (!result) {
      throw new Error('Failed to retrieve exchange from Keyv')
    }

    // TODO: consider checking dependency services here
    // But mock out in tests
    return json({
      message: 'transaction-service server status: ok.',
      healthy: true
    })
  } catch (e) {
    console.log(`exception in healthz: ${JSON.stringify(e)}`)

    // Handle HttpError from ExchangeService / protocol layer so we can return JSON with the correct status instead of a generic 503
    if (e instanceof HttpError) {
      return json(
        {
          message: e.message,
          healthy: false
        },
        { status: e.status }
      )
    }

    return json(
      {
        error: `transaction-service healthz check failed with error: ${e}`,
        healthy: false
      },
      { status: 503 }
    )
  }
}
