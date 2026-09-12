/**
 * Types for the exchange journal — the durable, append-only record of
 * exchange-lifecycle facts.
 *
 * The journal's purpose is stated at the head of `journal.ts`. It is a
 * separate, durable store because the exchange record does not survive long
 * enough to be read. `transactionManager.saveExchange` stores each exchange in
 * Keyv with `ttl = expires - now + 1000` and `config.exchangeTtl` defaults to
 * ten minutes, so the record is *evicted*, not expired-but-readable. Anything
 * that wants to know what an exchange did — after the exchange, after the run,
 * after the process — has to read something else. That something else is this.
 *
 * See `docs/adr/2026-08-11-exchange-journal-durable-record.md`. The short
 * version: raising the TTL was rejected, because the short window is itself
 * load-bearing behaviour that callers depend on and deliberately exercise.
 */

/**
 * Exchange-lifecycle events this service records.
 *
 * - `mint` — an exchange id was created and an exchange built around it.
 * - `discovery-served` — a metadata document was served, and which of the two
 *   well-known constructions the client used to ask for it.
 * - `interaction-method-shown` — the interaction page displayed a QR, and which
 *   payload it carried. Client-reported, because for a by-value OID4VP request
 *   nothing reaches our wire at all: there is no `request_uri` GET to infer the
 *   interaction method from, so the only party that knows which candidate was
 *   on screen is the page. Same reasoning as `discovery-served` — offering
 *   every candidate makes the service unable to discriminate on its own. ⚠️
 *   **`protocolProfileName` here is derived from the PAYLOAD BYTES**, and
 *   `protocolProfileSource` says whether it was: `payload` means the QR named
 *   it, `active` means the QR named nothing and this is what the server
 *   resolved at that moment. The two are true about different things and are
 *   never interchangeable. ⚠️ **`recognised` is false when this service could
 *   not rebuild the payload** for an offerable preset. Such a line is
 *   journalled in full and marked, and is NOT added to the exchange record's
 *   `interactionMethodElections` — the record takes only elections the service
 *   can vouch for, because the payload on this endpoint comes from the client.
 *   A line that was silently dropped from the record while appearing accepted
 *   here would be a difference no reader could see.
 * - `request-served` — an OID4VP authorization request object was fetched from
 *   `.../openid4vp/request`, and by whom. ⚠️ **By-reference arm only**, and it
 *   says so on the line: a by-value request carries every parameter inline in
 *   the deep link, so there is no GET to record and its absence means *this arm
 *   was not in use*, never *the wallet did not fetch*. Distinct from
 *   `discovery-served`, which is about the well-known metadata documents.
 *   ⚠️ **`protocolProfileName` on this line is the ELECTED profile**, when the
 *   fetched URL carried `?protocolProfile=`, and the `delivery`,
 *   `queryLanguage` and `requestObjectFormat` beside it are read from that same
 *   profile. Left reading the *active* profile the line would report one
 *   construction beside another construction's bytes, which misattributes every
 *   pinned fetch. Absent means no layer named a profile — not that none was
 *   served.
 * - `submission` — a presentation was submitted against this exchange, and on
 *   which protocol arm. Recorded on *arrival*, before any verdict, because the
 *   outcome events cannot stand in for it: `terminal` is not written when a
 *   structural rejection ends the request, and on the OID4VP by-value arm the
 *   response POST is one of only two service-side write points there are. A
 *   submission that produced neither a `terminal` nor an `error` line is a bug
 *   in this service, and now it is a *visible* one.
 * - `accommodation-served` — a request was answered on a route that exists only
 *   because an accommodation in `docs/accommodations.md` is served, and which
 *   accommodation it was. ⚠️ **This line records that the
 *   client took the accommodated route; it never records that the strict route
 *   was taken.** Its absence therefore means "no accommodated route was used",
 *   which is exactly the reading `token-endpoint-by-convention` needs: the
 *   finding there is that no `discovery-served` line was written at all, and an
 *   accommodation that wrote one to mark itself would have erased its own
 *   measurement. Attribution fields ride on this line for the same reason they
 *   ride on `discovery-served` — which client constructed the URL is a fact
 *   about the wallet and exists nowhere else once the process is gone.
 * - `terminal` — the exchange reached `complete` or `invalid`.
 * - `error` — an upstream cause was captured that the HTTP response could not
 *   carry (a status-service problem-details 409 collapsing into a generic 500
 *   is the motivating case).
 *
 * Deliberately a closed set. An open `event: string` would make the journal
 * unreadable by anything that has not read every writer, and the whole point of
 * a durable record is that a later reader can trust the shape.
 */
export const JOURNAL_EVENTS = [
  'mint',
  'discovery-served',
  'interaction-method-shown',
  'request-served',
  'submission',
  'accommodation-served',
  'terminal',
  'error'
] as const

export type JournalEvent = (typeof JOURNAL_EVENTS)[number]

/**
 * One line of the journal. Serialised as a single line of JSON (JSONL), so a
 * reader can consume the file incrementally and a partially-written tail costs
 * one line rather than the whole file.
 *
 * The four identifying fields are hoisted out of `detail` on purpose: a reader
 * must be able to group, filter and order without knowing anything about any
 * particular event's payload.
 */
export interface JournalEntry {
  /** ISO 8601, stamped at append time (not at write time — see `journal.ts`). */
  ts: string
  /**
   * The exchange this line is about. Carries `exchangeIdPrefix` when the
   * creating caller supplied one, which is what lets a caller correlate
   * journal lines with its own concept without this service knowing what that
   * concept is.
   */
  exchangeId: string
  workflowId: string
  tenantName: string
  event: JournalEvent
  /**
   * Event-specific payload, open-ended by design — the journal's job is to
   * keep whatever aids attribution after the fact, and a fixed schema here
   * would force a writer to drop the one field that turned out to matter.
   *
   * Passed through the redactor (`redact.ts`) before it is written. Nothing
   * else about the payload is filtered.
   */
  detail?: Record<string, unknown>
}

/** A journal entry as a caller supplies it; `ts` is stamped by the journal. */
export type JournalEntryInput = Omit<JournalEntry, 'ts'>
