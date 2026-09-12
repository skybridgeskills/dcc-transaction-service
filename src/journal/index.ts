/**
 * Public surface of the exchange journal.
 *
 * Kept small on purpose: writers need `journalExchangeEvent` and nothing else.
 * `appendJournalEntry` is exported for the one case that has identifying
 * fields but no exchange object to hand; `flushJournal` is for tests and
 * shutdown. The sink selection, the write chain and the redactor are
 * implementation details and stay unexported from here.
 */
export {
  appendJournalEntry,
  journalExchangeEvent,
  flushJournal
} from './journal.js'
export { REDACTED, redactJournalDetail } from './redact.js'
export { JOURNAL_EVENTS } from './types.js'
export type { JournalEntry, JournalEntryInput, JournalEvent } from './types.js'
