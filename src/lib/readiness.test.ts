/**
 * Readiness tests.
 *
 * The assertions that matter here are the ones about *shape*: that a failure is
 * attributed to one named dependency rather than collapsing into a single
 * `false`, and that `skipped` is neither an `ok` nor an `unready`. A readiness
 * check whose only observable output is a boolean would pass a test that only
 * asserted `ready`, which is why every case below reads the breakdown.
 */
import { describe, expect, test } from 'vitest'
import {
  checkReadiness,
  type CheckOutcome,
  type ReadinessIO
} from './readiness.js'

const DID = 'did:web:example.com:ui:example-tenant'

const baseConfig = (overrides: Partial<App.Config> = {}): App.Config =>
  ({
    signingService: 'http://signing.test',
    statusService: 'http://status.test',
    statusServiceToken: 'token',
    exchangeJournalPath: undefined,
    tenants: {
      exampleTenant: {
        tenantName: 'exampleTenant',
        tenantToken: 't',
        issuerInstances: [
          {
            id: DID,
            cryptosuite: 'eddsa-rdfc-2022',
            signingServiceTenant: 'example-tenant'
          }
        ]
      }
    },
    ...overrides
  }) as App.Config

const ok: CheckOutcome = { ok: true, detail: 'answered HTTP 200' }

const io = (overrides: Partial<ReadinessIO> = {}): ReadinessIO => ({
  http: async () => ok,
  didWebDocument: async () => ({ id: DID }),
  journalWritable: async () => ({ ok: true, detail: 'appendable' }),
  now: () => new Date('2026-08-11T00:00:00.000Z'),
  ...overrides
})

const byName = (readiness: Awaited<ReturnType<typeof checkReadiness>>) =>
  Object.fromEntries(readiness.dependencies.map((d) => [d.name, d]))

describe('checkReadiness', () => {
  test('reports every dependency by name, not a single boolean', async () => {
    const readiness = await checkReadiness(baseConfig(), io())
    expect(readiness.ready).toBe(true)
    expect(readiness.dependencies.map((d) => d.name)).toEqual([
      'signing-service',
      'status-service',
      'status-service-token',
      'tenants',
      'exchange-journal',
      `did-web-document:${DID}`
    ])
    // Every dependency carries something a human can act on.
    for (const dependency of readiness.dependencies) {
      expect(dependency.detail.length).toBeGreaterThan(0)
    }
  })

  test('an unreachable signing service is unready, and only that row fails', async () => {
    const readiness = await checkReadiness(
      baseConfig(),
      io({
        http: async (url) =>
          url.startsWith('http://signing.test')
            ? { ok: false, detail: 'ECONNREFUSED (no response)' }
            : ok
      })
    )
    expect(readiness.ready).toBe(false)
    const rows = byName(readiness)
    expect(rows['signing-service'].status).toBe('unready')
    expect(rows['signing-service'].detail).toContain('ECONNREFUSED')
    expect(rows['status-service'].status).toBe('ok')
    expect(rows.tenants.status).toBe('ok')
  })

  test('an unreachable status service names `pnpm dev`, the misconfiguration that looks like an outage', async () => {
    const readiness = await checkReadiness(
      baseConfig(),
      io({
        http: async (url) =>
          url.startsWith('http://status.test') ? { ok: false, detail: 'x' } : ok
      })
    )
    expect(byName(readiness)['status-service'].detail).toContain('pnpm dev')
  })

  test('an unconfigured status service is skipped, which is neither ok nor unready', async () => {
    const readiness = await checkReadiness(
      baseConfig({ statusService: '', statusServiceToken: '' }),
      io()
    )
    const rows = byName(readiness)
    expect(rows['status-service'].status).toBe('skipped')
    expect(rows['status-service-token']).toBeUndefined()
    expect(readiness.ready).toBe(true)
  })

  test('a configured status service with no token is unready on its own row', async () => {
    const readiness = await checkReadiness(
      baseConfig({ statusServiceToken: '' }),
      io()
    )
    expect(readiness.ready).toBe(false)
    expect(byName(readiness)['status-service-token'].status).toBe('unready')
  })

  test('an unset journal path is skipped and says what is not being recorded', async () => {
    const readiness = await checkReadiness(baseConfig(), io())
    const journal = byName(readiness)['exchange-journal']
    expect(journal.status).toBe('skipped')
    expect(journal.detail).toContain('EXCHANGE_JOURNAL_PATH')
  })

  test('a configured but unwritable journal path is unready', async () => {
    const readiness = await checkReadiness(
      baseConfig({ exchangeJournalPath: '/nope/journal.jsonl' }),
      io({
        journalWritable: async () => ({ ok: false, detail: 'EACCES' })
      })
    )
    expect(readiness.ready).toBe(false)
    const journal = byName(readiness)['exchange-journal']
    expect(journal.status).toBe('unready')
    expect(journal.target).toBe('/nope/journal.jsonl')
  })

  test('no tenants is unready', async () => {
    const readiness = await checkReadiness(baseConfig({ tenants: {} }), io())
    expect(byName(readiness).tenants.status).toBe('unready')
  })

  test('an issuer-instance id that is not a DID is unready and is quoted back', async () => {
    const readiness = await checkReadiness(
      baseConfig({
        tenants: {
          exampleTenant: {
            tenantName: 'exampleTenant',
            tenantToken: 't',
            issuerInstances: [
              {
                id: 'example.com/ui/example-tenant',
                cryptosuite: 'eddsa-rdfc-2022',
                signingServiceTenant: 'example-tenant'
              }
            ]
          }
        }
      }),
      io()
    )
    const tenants = byName(readiness).tenants
    expect(tenants.status).toBe('unready')
    expect(tenants.detail).toContain('example.com/ui/example-tenant')
  })

  test('a did:web document that resolves but names a different subject is unready — gap H1', async () => {
    const readiness = await checkReadiness(
      baseConfig(),
      io({ didWebDocument: async () => ({ id: 'did:web:elsewhere' }) })
    )
    expect(readiness.ready).toBe(false)
    const row = byName(readiness)[`did-web-document:${DID}`]
    expect(row.status).toBe('unready')
    expect(row.detail).toContain('did:web:elsewhere')
    expect(row.detail).toContain('H1')
  })

  test('a did:web document that cannot be derived is unready with the upstream cause', async () => {
    const readiness = await checkReadiness(
      baseConfig(),
      io({
        didWebDocument: async () => {
          throw new Error('signing service refused: HTTP 400')
        }
      })
    )
    const row = byName(readiness)[`did-web-document:${DID}`]
    expect(row.status).toBe('unready')
    expect(row.detail).toContain('HTTP 400')
  })

  test('no path-form did:web instance is skipped, and names the env vars that would add one', async () => {
    const readiness = await checkReadiness(
      baseConfig({
        tenants: {
          exampleTenant: { tenantName: 'exampleTenant', tenantToken: 't' }
        }
      }),
      io()
    )
    const row = byName(readiness)['did-web-documents']
    expect(row.status).toBe('skipped')
    expect(row.detail).toContain('TENANT_ISSUER_<n>_ID_<TENANT>')
    expect(readiness.ready).toBe(true)
  })

  test('nothing is mutated: the injected io is the only outside contact', async () => {
    const calls: string[] = []
    await checkReadiness(
      baseConfig({ exchangeJournalPath: '/tmp/j.jsonl' }),
      io({
        http: async (url) => {
          calls.push(`http ${url}`)
          return ok
        },
        didWebDocument: async () => {
          calls.push('did-web')
          return { id: DID }
        },
        journalWritable: async (p) => {
          calls.push(`journal ${p}`)
          return { ok: true, detail: 'appendable' }
        }
      })
    )
    expect(calls.sort()).toEqual([
      'did-web',
      'http http://signing.test',
      'http http://status.test/healthz',
      'journal /tmp/j.jsonl'
    ])
  })
})
