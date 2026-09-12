/**
 * Tests for the journal sink itself: the JSONL contract, the no-op default,
 * central redaction, and the promise that a journal failure never reaches the
 * exchange.
 *
 * `journal-outlives-exchange.test.ts` covers the property the journal exists
 * for — that a line survives the Keyv TTL that evicts the exchange record.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as config from '../config.js'
import {
  appendJournalEntry,
  flushJournal,
  journalExchangeEvent,
  REDACTED,
  type JournalEntry
} from './index.js'

let directory: string

/**
 * Point the journal at a path (or at the no-op sink with `undefined`).
 *
 * Spying `getConfig` rather than mutating `process.env`, because `getConfig`
 * memoises a frozen object on first read and the store has already been built
 * by the time any test runs.
 */
const useJournalPath = (exchangeJournalPath?: string) => {
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    exchangeJournalPath
  }))
}

const readJournal = async (path: string): Promise<JournalEntry[]> => {
  const raw = await readFile(path, 'utf8')
  return raw
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as JournalEntry)
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'exchange-journal-'))
})

afterEach(async () => {
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

describe('appendJournalEntry', () => {
  test('writes one JSON object per line with the identifying fields hoisted', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'mint',
      detail: { expires: '2026-08-11T18:14:22.113Z' }
    })
    await flushJournal()

    const [entry] = await readJournal(path)
    expect(entry).toMatchObject({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'mint',
      detail: { expires: '2026-08-11T18:14:22.113Z' }
    })
    expect(Date.parse(entry!.ts)).not.toBeNaN()
  })

  test('appends rather than truncating, and preserves append order', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    for (const event of ['mint', 'discovery-served', 'terminal'] as const) {
      appendJournalEntry({
        exchangeId: 'p1-9f2c',
        workflowId: 'claim',
        tenantName: 'acme',
        event
      })
    }
    await flushJournal()

    expect((await readJournal(path)).map((e) => e.event)).toEqual([
      'mint',
      'discovery-served',
      'terminal'
    ])
  })

  test('omits `detail` entirely when a caller supplies none', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'didAuth',
      tenantName: 'acme',
      event: 'terminal'
    })
    await flushJournal()

    expect(Object.keys((await readJournal(path))[0]!)).not.toContain('detail')
  })

  test('creates the parent directory rather than dropping the line', async () => {
    const path = join(directory, 'nested', 'deeper', 'journal.jsonl')
    useJournalPath(path)

    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'mint'
    })
    await flushJournal()

    expect(await readJournal(path)).toHaveLength(1)
  })

  test('redacts bearer tokens centrally, so no call site can forget to', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'error',
      detail: {
        headers: { Authorization: 'Bearer sk-live-9f2c-status-service' },
        message: 'allocate failed with Bearer sk-live-9f2c-status-service'
      }
    })
    await flushJournal()

    const raw = await readFile(path, 'utf8')
    expect(raw).not.toContain('sk-live-9f2c-status-service')
    expect(raw).toContain(REDACTED)
  })

  test('redacts a value the caller mutates after appending', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    const detail: Record<string, unknown> = { headers: {} }
    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'error',
      detail
    })
    // Redaction runs at append time, not at write time, so a late mutation
    // cannot smuggle a credential past it.
    ;(detail.headers as Record<string, unknown>).Authorization =
      'Bearer sk-live-smuggled'
    await flushJournal()

    expect(await readFile(path, 'utf8')).not.toContain('sk-live-smuggled')
  })
})

describe('the no-op sink', () => {
  test('creates no file and throws nothing when EXCHANGE_JOURNAL_PATH is unset', async () => {
    useJournalPath(undefined)
    const wouldBe = join(directory, 'journal.jsonl')

    expect(() =>
      appendJournalEntry({
        exchangeId: 'p1-9f2c',
        workflowId: 'claim',
        tenantName: 'acme',
        event: 'mint'
      })
    ).not.toThrow()
    await expect(flushJournal()).resolves.toBeUndefined()

    expect(existsSync(wouldBe)).toBe(false)
  })

  test('treats an empty configured path as unset', async () => {
    useJournalPath('')
    expect(() =>
      journalExchangeEvent(
        { exchangeId: 'p1-9f2c', workflowId: 'claim', tenantName: 'acme' },
        'mint'
      )
    ).not.toThrow()
    await expect(flushJournal()).resolves.toBeUndefined()
  })
})

describe('a journal failure never breaks an exchange', () => {
  test('an unwritable path logs and continues', async () => {
    // The configured path IS a directory, so `appendFile` fails with EISDIR —
    // the same class of failure as a read-only mount or a full disk.
    useJournalPath(directory)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(() =>
      appendJournalEntry({
        exchangeId: 'p1-9f2c',
        workflowId: 'claim',
        tenantName: 'acme',
        event: 'mint'
      })
    ).not.toThrow()
    await expect(flushJournal()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]![0])).toContain('exchange journal')
  })

  test('a later append still lands after an earlier one failed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    useJournalPath(directory)
    appendJournalEntry({
      exchangeId: 'doomed',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'mint'
    })
    await flushJournal()

    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)
    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'mint'
    })
    await flushJournal()

    expect((await readJournal(path)).map((e) => e.exchangeId)).toEqual([
      'p1-9f2c'
    ])
  })

  test('a payload the JSON encoder refuses keeps the identifying fields', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    appendJournalEntry({
      exchangeId: 'p1-9f2c',
      workflowId: 'claim',
      tenantName: 'acme',
      event: 'error',
      detail: { bigint: BigInt(1) as unknown as number }
    })
    await flushJournal()

    const [entry] = await readJournal(path)
    expect(entry).toMatchObject({ exchangeId: 'p1-9f2c', event: 'error' })
    expect(entry!.detail).toHaveProperty('journalSerializationError')
  })
})

describe('journalExchangeEvent', () => {
  test('lifts the identifying fields off an exchange', async () => {
    const path = join(directory, 'journal.jsonl')
    useJournalPath(path)

    journalExchangeEvent(
      {
        exchangeId: 'p1-9f2c-0a1b',
        workflowId: 'verify',
        tenantName: 'acme'
      },
      'terminal',
      { state: 'complete' }
    )
    await flushJournal()

    expect((await readJournal(path))[0]).toMatchObject({
      exchangeId: 'p1-9f2c-0a1b',
      workflowId: 'verify',
      tenantName: 'acme',
      event: 'terminal',
      detail: { state: 'complete' }
    })
  })
})
