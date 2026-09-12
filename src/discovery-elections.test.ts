/**
 * End-to-end tests for the elected-construction field.
 *
 * This service answers issuer metadata under both well-known constructions and
 * therefore discriminates on neither, which is what makes the client's choice
 * invisible in its outcome. These tests pin the two channels that make it
 * visible again, and pin that they agree:
 *
 * - the **exchange record**, read by a caller polling `GET` on the exchange;
 * - the **journal**, read after the record has been evicted.
 *
 * Both are written from one place (`recordDiscovery` in `hono.ts`), so the
 * failure worth catching is one of them silently going quiet.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import testVC from './test-fixtures/testVC.js'
import { flushJournal, type JournalEntry } from './journal/index.js'

const exchangeHost = 'http://localhost:4005'

let directory: string
let journalPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'discovery-elections-'))
  journalPath = join(directory, 'journal.jsonl')
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    statusService: '',
    tenantAuthenticationEnabled: false,
    exchangeJournalPath: journalPath
  }))
})

afterEach(async () => {
  // Drain first: journal writes are fire-and-forget by design, and an append
  // still in flight will recreate the file underneath the directory removal.
  await flushJournal()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

const createClaimExchange = async (): Promise<string> => {
  const response = await app.request('/workflows/claim/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        tenantName: 'default',
        exchangeHost,
        vc: JSON.stringify(testVC)
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const { iu } = (await response.json()) as { iu: string }
  return new URL(iu).pathname.split('/').pop()!
}

const pathSuffixIssuer = (id: string) =>
  `/.well-known/openid-credential-issuer/workflows/claim/exchanges/${id}`
const concatIssuer = (id: string) =>
  `/workflows/claim/exchanges/${id}/.well-known/openid-credential-issuer`
const concatAs = (id: string) =>
  `/workflows/claim/exchanges/${id}/.well-known/oauth-authorization-server`

const electionsOn = async (
  exchangeId: string
): Promise<App.DiscoveryElection[]> => {
  const response = await app.request(`/workflows/claim/exchanges/${exchangeId}`)
  expect(response.status).toBe(200)
  return (
    ((await response.json()) as App.ExchangeDetailBase).discoveryElections ?? []
  )
}

const journalledConstructions = async (exchangeId: string) => {
  await flushJournal()
  return (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
    .filter(
      (entry) =>
        entry.exchangeId === exchangeId && entry.event === 'discovery-served'
    )
    .map((entry) => entry.detail)
}

describe('elected construction · the exchange record', () => {
  test('an exchange nothing has discovered carries no elections', async () => {
    // Absent, not empty: "no client has asked yet" is not "a client asked in no
    // construction", and a reader must be able to tell those apart.
    const exchangeId = await createClaimExchange()
    const response = await app.request(
      `/workflows/claim/exchanges/${exchangeId}`
    )
    const exchange = (await response.json()) as App.ExchangeDetailBase
    expect(exchange.discoveryElections).toBeUndefined()
  })

  test('a single fetch records the construction it used', async () => {
    const exchangeId = await createClaimExchange()
    expect((await app.request(concatIssuer(exchangeId))).status).toBe(200)

    expect(await electionsOn(exchangeId)).toEqual([
      {
        construction: 'oidc-concat',
        doc: 'issuer',
        at: expect.any(String)
      }
    ])
  })

  test('a client that fetches both records both, in fetch order', async () => {
    const exchangeId = await createClaimExchange()
    await app.request(concatIssuer(exchangeId))
    await app.request(pathSuffixIssuer(exchangeId))

    expect((await electionsOn(exchangeId)).map((e) => e.construction)).toEqual([
      'oidc-concat',
      'rfc8414-path-suffix'
    ])
  })

  test('order follows the client, not the route table', async () => {
    const exchangeId = await createClaimExchange()
    await app.request(pathSuffixIssuer(exchangeId))
    await app.request(concatIssuer(exchangeId))

    expect((await electionsOn(exchangeId)).map((e) => e.construction)).toEqual([
      'rfc8414-path-suffix',
      'oidc-concat'
    ])
  })

  test('elections are per document, and repeats do not accumulate', async () => {
    const exchangeId = await createClaimExchange()
    await app.request(concatIssuer(exchangeId))
    await app.request(concatIssuer(exchangeId))
    await app.request(concatAs(exchangeId))

    expect(await electionsOn(exchangeId)).toMatchObject([
      { construction: 'oidc-concat', doc: 'issuer' },
      { construction: 'oidc-concat', doc: 'as' }
    ])
  })

  test('recording an election does not disturb the document served', async () => {
    // The record is written on the way out; a client must see the same metadata
    // it would have seen before this field existed.
    const exchangeId = await createClaimExchange()
    const first = await (await app.request(concatIssuer(exchangeId))).json()
    const second = await (await app.request(concatIssuer(exchangeId))).json()

    expect(second).toEqual(first)
  })
})

describe('elected construction · the journal', () => {
  test('every fetch is journalled, including the repeat the record folds away', async () => {
    const exchangeId = await createClaimExchange()
    await app.request(concatIssuer(exchangeId))
    await app.request(concatIssuer(exchangeId))
    await app.request(pathSuffixIssuer(exchangeId))

    expect(await journalledConstructions(exchangeId)).toEqual([
      { construction: 'oidc-concat', doc: 'issuer' },
      { construction: 'oidc-concat', doc: 'issuer' },
      { construction: 'rfc8414-path-suffix', doc: 'issuer' }
    ])
    // …and the record holds the deduplicated set of the same fetches.
    expect((await electionsOn(exchangeId)).map((e) => e.construction)).toEqual([
      'oidc-concat',
      'rfc8414-path-suffix'
    ])
  })
})
