/**
 * The property the journal exists for.
 *
 * `saveExchange` writes with `ttl = expires - now + 1000`, so the exchange
 * record is *evicted* when it expires — not marked expired and left readable.
 * With the default ten-minute `EXCHANGE_TTL`, the first exchange of a run is
 * gone before the run ends, and anything that wants to read back what that
 * exchange did has nothing to read.
 *
 * This test reproduces that at test speed: mint an exchange, save it with a
 * short `expires`, wait for eviction, and assert the store has forgotten it
 * while the journal has not.
 */
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as config from '../config.js'
import { getWorkflow } from '../workflows.js'
import {
  createExchangeDidAuth,
  validateExchangeDidAuth
} from '../workflows/didAuthWorkflow.js'
import { getExchangeDataById, saveExchange } from '../transactionManager.js'
import { flushJournal, type JournalEntry } from './index.js'

let directory: string
let journalPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'exchange-journal-ttl-'))
  journalPath = join(directory, 'journal.jsonl')
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    exchangeJournalPath: journalPath
  }))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

const readJournal = async (): Promise<JournalEntry[]> =>
  (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)

test('the journal outlives the Keyv record it describes', async () => {
  const workflow = getWorkflow('didAuth')!
  const minted = createExchangeDidAuth({
    data: validateExchangeDidAuth({
      exchangeIdPrefix: 'ttl',
      variables: { exchangeHost: 'http://localhost:4004' }
    }),
    config: config.getConfig(),
    workflow
  })

  // A 100ms lifetime gives Keyv a ttl of ~1.1s (`expires - now + 1000`).
  const shortLived: App.ExchangeDetailBase = {
    ...minted,
    expires: new Date(Date.now() + 100).toISOString()
  }
  await saveExchange(shortLived)
  await flushJournal()

  await new Promise((resolve) => setTimeout(resolve, 1400))

  // The store has evicted it — this is the failure the journal answers.
  await expect(getExchangeDataById(shortLived.exchangeId)).rejects.toThrow(
    /Unknown exchangeId/
  )

  const mintLines = (await readJournal()).filter(
    (entry) =>
      entry.event === 'mint' && entry.exchangeId === shortLived.exchangeId
  )
  expect(mintLines).toHaveLength(1)
  expect(mintLines[0]).toMatchObject({
    workflowId: 'didAuth',
    detail: { exchangeIdPrefix: 'ttl' }
  })
  // And the caller-side correlation survives with it, because it is in the id.
  expect(mintLines[0]!.exchangeId.startsWith('ttl-')).toBe(true)
})
