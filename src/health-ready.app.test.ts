/**
 * Hono integration tests for `GET /health/ready`.
 *
 * Two things are pinned here and both are load-bearing:
 *
 * 1. **The breakdown survives the HTTP boundary.** A 503 that says only
 *    `{ready:false}` is the generic-failure shape this service exists to stop,
 *    so the body is asserted per dependency in both directions.
 * 2. **`/healthz` is untouched.** It is a liveness check on a load balancer's
 *    target group and it must not acquire readiness semantics by accident, so
 *    the two routes are asserted to be different endpoints answering
 *    differently.
 */
import { describe, expect, test, beforeEach, afterEach, vi } from 'vitest'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import { clearDidWebDocumentCache } from './lib/did-web-document.js'
import type { Readiness } from './lib/readiness.js'

const SIGNING_SERVICE = 'http://signing.health-ready.test'
const STATUS_SERVICE = 'http://status.health-ready.test'

beforeEach(() => {
  clearDidWebDocumentCache()
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    signingService: SIGNING_SERVICE,
    statusService: STATUS_SERVICE,
    statusServiceToken: 'a-token',
    exchangeJournalPath: undefined,
    tenants: {
      example: { tenantName: 'example', tenantToken: 'token' }
    }
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

const readinessOf = async (): Promise<{
  status: number
  body: Readiness
}> => {
  const response = await app.request('/health/ready')
  return { status: response.status, body: (await response.json()) as Readiness }
}

const row = (body: Readiness, name: string) =>
  body.dependencies.find((d) => d.name === name)

describe('GET /health/ready', () => {
  test('200 with a per-dependency breakdown when everything answers', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ status: 200 } as never)

    const { status, body } = await readinessOf()

    expect(status).toBe(200)
    expect(body.ready).toBe(true)
    expect(row(body, 'signing-service')?.status).toBe('ok')
    expect(row(body, 'status-service')?.status).toBe('ok')
    expect(row(body, 'tenants')?.status).toBe('ok')
    expect(typeof body.checkedAt).toBe('string')
  })

  test('503 with the same breakdown shape, naming the dependency that failed', async () => {
    vi.spyOn(axios, 'get').mockImplementation((async (url: string) =>
      url.startsWith(SIGNING_SERVICE)
        ? Promise.reject(
            Object.assign(new Error('connect ECONNREFUSED'), {
              isAxiosError: true,
              code: 'ECONNREFUSED'
            })
          )
        : { status: 200 }) as never)

    const { status, body } = await readinessOf()

    expect(status).toBe(503)
    expect(body.ready).toBe(false)
    expect(row(body, 'signing-service')?.status).toBe('unready')
    expect(row(body, 'signing-service')?.detail).toContain('ECONNREFUSED')
    // The breakdown is not truncated on failure: the healthy rows still report.
    expect(row(body, 'status-service')?.status).toBe('ok')
    expect(row(body, 'tenants')?.status).toBe('ok')
  })

  test('does not write an exchange record — /healthz is the one that does that', async () => {
    const get = vi.spyOn(axios, 'get').mockResolvedValue({ status: 200 } as never)

    await app.request('/health/ready')

    // Only outbound GETs; no store writes, no signing, no allocate.
    for (const call of get.mock.calls) {
      expect(String(call[0])).toMatch(/^http:\/\/(signing|status)\./)
    }
  })

  test('boot provenance survives the HTTP boundary, on 200 and on 503 alike', async () => {
    // The gate that reads this runs `curl | jq` against a service it cannot
    // assume is ready — a stale process is very often an unready one too, so
    // provenance has to be readable from the 503 body or the check goes blind
    // in the case it most needs to fire.
    vi.spyOn(axios, 'get').mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), {
        isAxiosError: true,
        code: 'ECONNREFUSED'
      })
    )

    const { status, body } = await readinessOf()

    expect(status).toBe(503)
    expect(body.provenance.pid).toBe(process.pid)
    expect(typeof body.provenance.bootedAt).toBe('string')
    expect(body.provenance.display).toContain('transaction-service')
    // This checkout is a git repo, so it can say which commit it booted from.
    expect(body.provenance.gitSha).toMatch(/^[0-9a-f]{40}$/)
  })

  test('provenance is a fact about the process, not a dependency and not a term in `ready`', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ status: 200 } as never)

    const { status, body } = await readinessOf()

    // A dirty or stale checkout must not turn a healthy service into a 503:
    // staleness is a comparison only the caller can make, and folding it in
    // here would make every developer's working tree an outage.
    expect(status).toBe(200)
    expect(body.ready).toBe(true)
    expect(body.dependencies.some((d) => /provenance|git|commit/i.test(d.name))).toBe(
      false
    )
  })

  test('/healthz is a different route and keeps its own response shape', async () => {
    vi.spyOn(axios, 'get').mockResolvedValue({ status: 200 } as never)

    const healthz = (await (await app.request('/healthz')).json()) as Record<
      string,
      unknown
    >

    // The liveness contract: `healthy`, no `dependencies`, no `ready`.
    expect(healthz).toHaveProperty('healthy')
    expect(healthz).not.toHaveProperty('dependencies')
    expect(healthz).not.toHaveProperty('ready')
  })
})
