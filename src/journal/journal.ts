/**
 * The exchange journal — a durable, append-only JSONL record of
 * exchange-lifecycle facts, keyed by `exchangeId`.
 *
 * ## What the journal is for
 *
 * This service interoperates with many independent implementations, and no
 * two of them behave alike. The journal is the developer tool for working
 * with that: it records what actually happened on the wire, so a developer
 * can see how another implementation behaved, see how ours behaved, and tell
 * which side a failure belongs to. `attribution.ts` carries the last of
 * those — the party a fetch came from.
 *
 * It records events, not verdicts. A line says what was served, what arrived
 * and when; nothing here ranks one implementation against another.
 *
 * ## Why this is not the Keyv store
 *
 * `saveExchange` writes each exchange with `ttl = expires - now + 1000`, and
 * `EXCHANGE_TTL` defaults to ten minutes. That is an *eviction*, not an expiry
 * flag: after the TTL the record is gone and there is nothing to read. Raising
 * the TTL was rejected — the short window is behaviour callers depend on and
 * deliberately exercise. So the durable record has to live somewhere the TTL
 * cannot reach, and the two stores stay separate on purpose. See
 * `docs/adr/2026-08-11-exchange-journal-durable-record.md`.
 *
 * ## Contract
 *
 * - **Append-only.** Never truncated, no TTL, no rotation by this service.
 * - **No-op when unconfigured.** With `EXCHANGE_JOURNAL_PATH` unset, nothing is
 *   opened, nothing is created, and nothing throws. Production and CI are
 *   unaffected by the journal's existence; a caller that wants one opts in.
 * - **Never breaks an exchange.** A failed write — unwritable path, full disk,
 *   a serialisation the JSON encoder refuses — logs and continues. The journal
 *   is evidence, not control flow. This is why {@link appendJournalEntry}
 *   returns `void` and not a promise: no call site can accidentally make an
 *   exchange wait on, or fail because of, a journal write.
 *
 * ## Ordering, and why writes are chained
 *
 * Entries are serialised at append time and written through a single promise
 * chain, so lines land in the order they were appended even though callers
 * never await them. `ts` is stamped at append time rather than write time for
 * the same reason: the timestamp should say when the fact happened, not when
 * the filesystem got round to it.
 *
 * ## Module boundary
 *
 * This module imports the app config and nothing else from the service. In
 * particular it imports no workflow, no route and no store, so nothing in the
 * service can come to depend on the journal being enabled.
 */
import { appendFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { getConfig } from '../config.js'
import { redactJournalDetail } from './redact.js'
import type { JournalEntry, JournalEntryInput, JournalEvent } from './types.js'

/**
 * Tail of the write chain. Every append links onto this, which both serialises
 * concurrent writes to one file handle at a time and gives {@link flushJournal}
 * something to await.
 */
let writes: Promise<void> = Promise.resolve()

/** Directories already `mkdir -p`'d this process, so we do it once per path. */
const ensuredDirectories = new Set<string>()

/**
 * The configured sink, or `undefined` for the no-op sink.
 *
 * Read per append rather than captured at module load: `getConfig()` memoises,
 * so this is a property read, and reading late means a test (or a future
 * runtime reconfiguration) does not depend on module import order.
 */
const journalPath = (): string | undefined => getConfig().exchangeJournalPath

/**
 * Append one entry to the journal. Fire-and-forget by design — see the module
 * contract above.
 *
 * `detail` is redacted synchronously, before the write is queued, so a caller
 * that mutates the object afterwards cannot change what was journalled and
 * cannot slip a credential past the redactor by mutating it late.
 */
export const appendJournalEntry = (input: JournalEntryInput): void => {
  const path = journalPath()
  if (!path) return

  const entry: JournalEntry = {
    ts: new Date().toISOString(),
    exchangeId: input.exchangeId,
    workflowId: input.workflowId,
    tenantName: input.tenantName,
    event: input.event,
    ...(input.detail !== undefined
      ? {
          detail: redactJournalDetail(input.detail) as Record<string, unknown>
        }
      : {})
  }

  let line: string
  try {
    line = `${JSON.stringify(entry)}\n`
  } catch (error) {
    // A `detail` the encoder refuses (a BigInt, a getter that throws) must not
    // cost the whole line. Keeping the identifying fields means the event is
    // still countable and attributable even when its payload is not.
    line = `${JSON.stringify({
      ts: entry.ts,
      exchangeId: entry.exchangeId,
      workflowId: entry.workflowId,
      tenantName: entry.tenantName,
      event: entry.event,
      detail: { journalSerializationError: String(error) }
    })}\n`
  }

  writes = writes
    .then(async () => {
      const directory = dirname(path)
      if (!ensuredDirectories.has(directory)) {
        await mkdir(directory, { recursive: true })
        ensuredDirectories.add(directory)
      }
      // `appendFile` opens with O_APPEND, so concurrent writers (a second
      // process, a tail) cannot interleave within a line.
      await appendFile(path, line, 'utf8')
    })
    .catch((error) => {
      console.warn(
        `exchange journal: append failed (event=${input.event} exchange=${input.exchangeId}): ${error}`
      )
    })
}

/**
 * Convenience wrapper for the common case: journalling something about an
 * exchange we are already holding.
 *
 * Takes the narrowest shape it needs rather than a full `ExchangeDetailBase`,
 * so call sites in the middle of building an exchange can use it too.
 */
export const journalExchangeEvent = (
  exchange: Pick<
    App.ExchangeDetailBase,
    'exchangeId' | 'workflowId' | 'tenantName'
  >,
  event: JournalEvent,
  detail?: Record<string, unknown>
): void =>
  appendJournalEntry({
    exchangeId: exchange.exchangeId,
    workflowId: exchange.workflowId,
    tenantName: exchange.tenantName,
    event,
    ...(detail !== undefined ? { detail } : {})
  })

/**
 * Resolve once every append queued so far has hit the filesystem.
 *
 * Exists for tests and for a future shutdown hook. Request handling must never
 * await this — a journal that can make an exchange wait has stopped being
 * evidence and started being control flow.
 */
export const flushJournal = (): Promise<void> => writes
