import { getConfig } from './config.js'
import { getExchangeData, saveExchange } from './transactionManager.js'
import { checkReadiness, type ReadinessIO } from './lib/readiness.js'
import type { Context } from 'hono'

/**
 * `GET /health/ready` — *can this service run an exchange right now?*
 *
 * Deliberately **not** `/healthz`, which stays exactly as it is below: that one
 * is a liveness check that writes a Keyv record and sleeps
 * `4 × keyvWriteDelayMs`, which is the wrong shape for readiness and is wired
 * to a load balancer's target group. Repurposing it would break both jobs.
 *
 * The body is a per-dependency breakdown and never a bare boolean — see the
 * module comment on `lib/readiness.ts` for why that distinction is the whole
 * point. 200 when nothing is `unready`, 503 otherwise; the breakdown is
 * identical either way, so a caller parses one shape.
 *
 * `io` is injectable for tests only; the route passes nothing.
 */
export const readinessCheck = async (c: Context, io?: ReadinessIO) => {
  const readiness = await checkReadiness(getConfig(), io)
  c.status(readiness.ready ? 200 : 503)
  return c.json(readiness)
}

export const healthCheck = async (c: Context) => {
  const config = getConfig()
  try {
    const timestamp = Date.now()
    const success = await saveExchange({
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
    const result = await getExchangeData(`healthz-${timestamp}`, 'healthz')
    if (!result) {
      throw new Error('Failed to retrieve exchange from Keyv')
    }

    // Dependency services are deliberately NOT checked here. That is
    // `/health/ready` above, which reports them one by one and mutates
    // nothing; folding them in would make this route both slow and ambiguous,
    // and it is on a load balancer's target group.
  } catch (e) {
    console.log(`exception in healthz: ${JSON.stringify(e)}`)
    c.status(503)
    return c.json({
      error: `transaction-service healthz check failed with error: ${e}`,
      healthy: false
    })
  }
  return c.json({
    message: 'transaction-service server status: ok.',
    healthy: true
  })
}
