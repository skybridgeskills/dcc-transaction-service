/**
 * The interaction method election, on BOTH the journal and the exchange record
 * — through the route that writes them.
 *
 * ⚠️ **The split is the thing under test.** The journal takes every reported
 * interaction method, including one this service cannot rebuild; the record
 * takes only elections it can vouch for, because the payload on this endpoint
 * comes from the client. See `lib/interaction-method-election.ts` and
 * `app.d.ts`'s `InteractionMethodElection`.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import * as transactionManager from '../transactionManager.js'
import { flushJournal, type JournalEntry } from '../journal/index.js'

const EXCHANGE_HOST = 'http://localhost:4005'
const DEFAULT_PROFILE = 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
const VPR_PROFILE = 'vcapi-vpr-bare-origin-domain'

let journalDirectory: string
let journalPath: string

beforeAll(async () => {
  journalDirectory = await mkdtemp(join(tmpdir(), 'interaction-method-election-'))
  journalPath = join(journalDirectory, 'journal.jsonl')
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    tenantAuthenticationEnabled: false,
    exchangeJournalPath: journalPath,
    defaultProtocolProfileName: DEFAULT_PROFILE
  }))
})

afterAll(async () => {
  await flushJournal()
  vi.restoreAllMocks()
  await rm(journalDirectory, { recursive: true, force: true })
})

const createVerifyExchange = async (): Promise<string> => {
  const response = await app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: EXCHANGE_HOST,
        tenantName: 'default',
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
        trustedIssuers: [],
        vprClaims: []
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const protocols = (await response.json()) as { vcapi: string }
  return new URL(protocols.vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]!
}

interface Preset {
  payloadId: string
  protocolProfileName: string | null
  isDefault: boolean
  payload: string
}

const presetsFor = async (exchangeId: string): Promise<Preset[]> =>
  (
    (await (
      await app.request(`/interactions/${exchangeId}/presets`)
    ).json()) as { presets: Preset[] }
  ).presets

const reportInteractionMethod = async (
  exchangeId: string,
  payloadId: string,
  payload: string
): Promise<number> =>
  (
    await app.request(`/interactions/${exchangeId}/method`, {
      method: 'POST',
      body: JSON.stringify({ payloadId, payload }),
      headers: { 'Content-Type': 'application/json' }
    })
  ).status

const electionsOn = async (
  exchangeId: string
): Promise<App.InteractionMethodElection[] | undefined> =>
  (await transactionManager.getExchangeData(exchangeId, 'verify'))
    .interactionMethodElections

const shownLinesFor = async (exchangeId: string): Promise<JournalEntry[]> => {
  await flushJournal()
  return (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
    .filter((e) => e.exchangeId === exchangeId && e.event === 'interaction-method-shown')
}

describe('method election · the name comes from the bytes', () => {
  test('⚠️ a pinned payload records source `payload` and the name the QR carries', async () => {
    const exchangeId = await createVerifyExchange()
    const pinned = (await presetsFor(exchangeId)).find(
      (p) => p.protocolProfileName === VPR_PROFILE
    )!
    // ⚠️ `payloadId` is reported as something ELSE on purpose. The name must
    // come from the payload, never from the control that selected it — so a
    // mis-reported id cannot change the recorded construction.
    expect(await reportInteractionMethod(exchangeId, pinned.payloadId, pinned.payload)).toBe(
      204
    )

    expect(await electionsOn(exchangeId)).toEqual([
      {
        payloadId: pinned.payloadId,
        protocolProfileName: VPR_PROFILE,
        source: 'payload',
        at: expect.any(String)
      }
    ])
  })

  test('⚠️ an unpinned payload records the server-resolved name with source `active`', async () => {
    const exchangeId = await createVerifyExchange()
    const active = (await presetsFor(exchangeId)).find(
      (p) => p.payloadId === 'iu' && p.isDefault
    )!
    expect(await reportInteractionMethod(exchangeId, 'iu', active.payload)).toBe(204)

    const elections = await electionsOn(exchangeId)
    expect(elections![0]!.protocolProfileName).toBe(DEFAULT_PROFILE)
    // ⚠️ Distinguishable on the record: this is true about a resolution, the
    // case above is true about the bytes that were on screen.
    expect(elections![0]!.source).toBe('active')
  })
})

describe('method election · a set, in first-election order', () => {
  test('two methods both appear, in the order they were shown', async () => {
    const exchangeId = await createVerifyExchange()
    const presets = await presetsFor(exchangeId)
    const iu = presets.find((p) => p.payloadId === 'iu' && p.isDefault)!
    const oid4vp = presets.find((p) => p.payloadId === 'OID4VP' && p.isDefault)!
    await reportInteractionMethod(exchangeId, 'iu', iu.payload)
    await reportInteractionMethod(exchangeId, 'OID4VP', oid4vp.payload)

    expect((await electionsOn(exchangeId))!.map((e) => e.payloadId)).toEqual([
      'iu',
      'OID4VP'
    ])
  })

  test('⚠️ a repeat of the same pair is not appended', async () => {
    const exchangeId = await createVerifyExchange()
    const iu = (await presetsFor(exchangeId)).find(
      (p) => p.payloadId === 'iu' && p.isDefault
    )!
    await reportInteractionMethod(exchangeId, 'iu', iu.payload)
    await reportInteractionMethod(exchangeId, 'iu', iu.payload)
    await reportInteractionMethod(exchangeId, 'iu', iu.payload)

    expect(await electionsOn(exchangeId)).toHaveLength(1)
    // ⚠️ And every individual report is still in the journal, so nothing is
    // lost.
    expect(await shownLinesFor(exchangeId)).toHaveLength(3)
  })

  test('the same method under two constructions is two entries', async () => {
    const exchangeId = await createVerifyExchange()
    const presets = await presetsFor(exchangeId)
    const active = presets.find((p) => p.payloadId === 'iu' && p.isDefault)!
    const pinned = presets.find(
      (p) => p.payloadId === 'iu' && p.protocolProfileName === VPR_PROFILE
    )!
    await reportInteractionMethod(exchangeId, 'iu', active.payload)
    await reportInteractionMethod(exchangeId, 'iu', pinned.payload)

    const elections = await electionsOn(exchangeId)
    expect(elections!.map((e) => e.protocolProfileName)).toEqual([
      DEFAULT_PROFILE,
      VPR_PROFILE
    ])
  })
})

describe('method election · the journal takes everything, the record does not', () => {
  test('⚠️ an unrecognised payload is journalled, marked, and NOT recorded', async () => {
    const exchangeId = await createVerifyExchange()
    // Bytes this service did not build. `interaction-method-shown` takes its
    // payload from the client, so without the recognition gate the client could
    // grow the record.
    const status = await reportInteractionMethod(
      exchangeId,
      'iu',
      'openid4vp://?client_id=whatever&request_uri=https%3A%2F%2Fattacker.example%2Fr'
    )
    expect(status).toBe(204)
    expect(await electionsOn(exchangeId)).toBeUndefined()

    const [line] = await shownLinesFor(exchangeId)
    const detail = line!.detail as Record<string, unknown>
    // ⚠️ Journalled in full AND visibly unrecognised. Dropping it from the
    // record while it appeared accepted here would be invisible to a reader.
    expect(detail.recognised).toBe(false)
    expect(detail.payload).toContain('attacker.example')
  })

  test('an unparseable payload still journals, and still returns 204', async () => {
    const exchangeId = await createVerifyExchange()
    expect(await reportInteractionMethod(exchangeId, 'iu', 'not-a-url-at-all')).toBe(204)
    expect(await shownLinesFor(exchangeId)).toHaveLength(1)
    expect(await electionsOn(exchangeId)).toBeUndefined()
  })

  test('⚠️ a failed persist does not fail the request', async () => {
    // A scan must not fail because the record of it could not be written. The
    // route's own docblock argues this about journalling; it holds for the
    // record too.
    const exchangeId = await createVerifyExchange()
    const iu = (await presetsFor(exchangeId)).find(
      (p) => p.payloadId === 'iu' && p.isDefault
    )!
    const save = vi
      .spyOn(transactionManager, 'saveExchange')
      .mockRejectedValueOnce(new Error('store is down'))
    try {
      expect(await reportInteractionMethod(exchangeId, 'iu', iu.payload)).toBe(204)
    } finally {
      save.mockRestore()
    }
  })

  test('the journal line carries the name and its source', async () => {
    const exchangeId = await createVerifyExchange()
    const pinned = (await presetsFor(exchangeId)).find(
      (p) => p.protocolProfileName === VPR_PROFILE
    )!
    await reportInteractionMethod(exchangeId, pinned.payloadId, pinned.payload)
    const detail = (await shownLinesFor(exchangeId))[0]!.detail as Record<
      string,
      unknown
    >
    expect(detail.protocolProfileName).toBe(VPR_PROFILE)
    expect(detail.protocolProfileSource).toBe('payload')
    expect(detail.recognised).toBe(true)
  })
})
