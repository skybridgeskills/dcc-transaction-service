# The exchange journal: a durable record separate from the exchange record

- Status: Accepted
- Date: 2026-08-11
- Workflow: all (`claim`, `didAuth`, `verify`)

## Context

### What the journal is for

This service interoperates with many independent implementations, and no two of
them behave alike. The journal is the developer tool for working with that: it
records what actually happened on the wire, so a developer can see how another
implementation behaved, see how ours behaved, and tell which side a failure
belongs to. `src/journal/attribution.ts` carries the last of those — the party
a fetch came from.

⚠️ **It records events, not verdicts.** A line says what was served, what
arrived and when; nothing here ranks one implementation against another. Every
decision below follows from that: the closed event enum, the four hoisted
fields, the narrow redaction, and the rule that a write can never affect an
exchange.

### Why it cannot be the exchange record

The exchange record is deliberately ephemeral, and its ephemerality is
load-bearing.

`transactionManager.saveExchange` writes each exchange into Keyv with
`ttl = new Date(data.expires).getTime() - Date.now() + 1000`, and
`config.exchangeTtl` defaults to ten minutes (`EXCHANGE_TTL`). This is an
**eviction**, not an expiry flag: once the TTL lapses the key is gone and
`getExchangeData` 404s. Nothing in the service retains what the exchange did.

That is sufficient while every consumer of an exchange is the exchange itself,
and insufficient the moment anything outside the request needs to know what
happened:

- A reader looking at an exchange's outcome after the fact reads nothing,
  because a working session lasting longer than the TTL loses its earliest
  exchanges *before the session ends*.
- Which of the two OID4VCI well-known constructions a client used is written to
  stdout and nowhere else.
- An upstream cause — the status service's problem-details `409` for a
  credential id that already holds a revocation index — is collapsed into a
  generic 500 by `callService`, and the diagnosis is lost at the moment it is
  produced.

**Raising the TTL was considered and rejected.** The short window is not an
implementation detail that happens to be small; it is behaviour. Callers depend
on minting an exchange immediately before use precisely because the window is
short, and expiry behaviour is itself something clients are exercised against —
a wallet meeting an expired exchange gets a bare 404 and renders whatever it
renders, which is a thing worth observing. Lengthening the TTL to make a record
readable would change the behaviour being observed in order to observe it.

**Folding a durable record into the Keyv store was also rejected.** It is one
store with one lifetime; a second class of value inside it with a different
lifetime means either two TTL policies in one namespace or a store that never
evicts. Both destroy the property above.

## Decision

Add a second store with the opposite lifetime: an **append-only JSONL exchange
journal**, keyed by `exchangeId`, with **no TTL**, never truncated or rotated by
this service.

1. **A new `src/journal/` module** with a small surface —
   `journalExchangeEvent`, `appendJournalEntry`, `flushJournal`. It imports the
   app config and nothing else from the service: no workflow, no route, no
   store. Nothing in the service can come to depend on the journal existing.

2. **One JSON object per line.** The four identifying fields — `ts`,
   `exchangeId`, `workflowId`, `tenantName` — plus a closed `event` enum and an
   open-ended `detail`. A reader must be able to group, filter and order without
   knowing any particular event's payload; JSONL means a partially-written tail
   costs one line rather than the file.

3. **Four events**: `mint` (at each of the three `createExchange*` functions),
   `discovery-served` (at `logDiscovery`, recording the construction the client
   used), `terminal` (`complete` / `invalid`), and `error` (the upstream-cause
   capture point).

4. **`terminal` is hooked into the persistence layer**, not into the five call
   sites that assign a terminal state. Those five have nothing in common except
   that they all reach `saveExchange` / `saveExchangeWithCAS`, and a sixth is
   exactly what a later change adds. Every terminal *write* is recorded rather
   than every terminal *transition*: detecting a transition would mean a read
   before each write purely to feed the journal, and an exchange driven to
   `complete` twice is a fact worth having, not noise.

5. **Configured by `EXCHANGE_JOURNAL_PATH`, and a no-op when unset.** No file is
   opened or created and nothing is recorded unless a deployment opts in. The
   journal is unbounded by construction, so where that growth lives has to be a
   deployment's choice.

6. **A journal write can never break an exchange.** `appendJournalEntry` returns
   `void`, not a promise, so no call site can make an exchange wait on — or fail
   because of — a write. Failures log and continue. The journal is evidence, not
   control flow.

7. **Redaction is narrow and central.** The journal keeps request and response
   bodies, credential contents and error payloads, because a record that cannot
   attribute a failure to a cause is not worth keeping. The single hard
   redaction is `Authorization` bearer tokens — the one this service presents to
   the status service, and any an inbound request carried. It is applied inside
   `appendJournalEntry` rather than at each call site, because a rule each
   writer has to remember is one the writer added later forgets, and the failure
   mode is a live credential in a file with no TTL.

## Consequences

- **There are now two stores with two lifetimes, and the distinction has to be
  respected.** The Keyv record is the live exchange; the journal is the durable
  one. A future "simplification" that merges them re-creates the problem this
  ADR exists to solve. Neither is a cache of the other: the journal never holds
  live state, and the exchange record is never read back after eviction.

- **This is hard to reverse.** Anything that reads back what an exchange did —
  a diagnostic pass, a per-exchange artifact, any post-hoc attribution — reads
  the journal. That makes the file format an interface, and the four hoisted
  fields plus the closed `event` enum are the part of it that must stay stable.

- **The journal grows without bound where it is enabled.** Deliberate: a service
  that truncates its own durable record has not got one. Rotation and retention
  belong to whatever operates the deployment, which is why the path is
  configuration rather than a default.

- **Ordering is guaranteed, delivery is not.** Appends are serialised through a
  single promise chain so lines land in the order they were appended, and `ts`
  is stamped at append time so it says when the fact happened. But a write that
  fails is logged and dropped: a reader must treat the journal as
  complete-in-practice, not as a transactional log. Anything that must not be
  lost does not belong here.

- **`flushJournal` exists and must not be awaited in a request path.** A journal
  a request can wait on has stopped being evidence.

## Alternatives considered

- **Raise `EXCHANGE_TTL`.** Rejected: the short window is behaviour callers
  depend on and deliberately exercise, in both directions.
- **Keep the durable record in Keyv without a TTL.** Rejected: one namespace
  with two lifetimes, and it makes the durable record depend on the live store's
  backend (memory, file, Redis) being configured and healthy.
- **Emit live by polling the exchange record during the session.** Rejected:
  fragile, and it puts work inside a scarce human loop — the record can still be
  evicted between polls, so it does not actually solve the problem.
- **Application-level structured logging to stdout.** Rejected as a separate
  item and folded in here: this journal *is* the structured log, scoped to
  exchange-lifecycle facts and addressed by `exchangeId`. Stdout is not
  addressable, rolls, and interleaves with everything else.
