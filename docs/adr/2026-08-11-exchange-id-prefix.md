# `exchangeIdPrefix`: a caller-supplied component of a server-generated identifier

- Status: Accepted
- Date: 2026-08-11
- Workflow: all (`claim`, `didAuth`, `verify`)

## Context

A caller needs to correlate an exchange with a concept of its own — a test
run, a batch, a ticket — and to do it from *outside* this service: in a traffic
capture, in a device log, in a filename, in a file written after the exchange
is over.

Two fields that could carry such a value already existed, and both were
rejected:

- **`variables.retrievalId`** — already used by callers, and already the batch
  API's correlation handle.
- **`variables.metadata`** — an open `any` on the exchange variables.

Both fail for the same reason: **they live only in the store**. Reading either
one back means asking this service for the exchange record, which means the
record still exists — and it does not, ten minutes after creation (see
[the exchange journal ADR](2026-08-11-exchange-journal-durable-record.md)). It
also means anything correlating an exchange needs network access to this service
and a token for it, which a log-processing tool run after the fact does not have
and should not need.

The `exchangeId` is different in kind. It is the only value that appears on
**every** place a reader can look at once:

- the interaction URL (`/interactions/:exchangeId`) and therefore the QR code,
- all 16 `:exchangeId` routes, including every OID4VCI and OID4VP discovery URL,
- a traffic capture's request list,
- the client device's log,
- the Keyv key,
- and every line of the exchange journal.

None of those channels can be taught about a caller's concept. All of them
already carry the id.

## Decision

Accept an optional **`exchangeIdPrefix`** on `vcApiExchangeCreateSchema` and
mint `exchangeId = \`${exchangeIdPrefix}-${randomUUID()}\`` when it is present,
a bare `randomUUID()` when it is not.

1. **It is a sibling of `variables`, not a member.** It is not an exchange
   variable interpolated into a credential template; it is an instruction to the
   id minter, read once at creation. Putting it inside `variables` would imply
   it is template input, which it is not.

2. **It is named for this service, not for the caller.** The service uses the
   value in its own business logic — it becomes part of an identifier the
   service mints, stores and routes on — so it takes the service's noun. A
   client-sensible name would be right only if the service passed the value
   through untouched. This is a **general transaction-service capability**
   (correlate an exchange with any caller-side concept), not a hook for any
   particular caller, and nothing in the service knows what the value means.

3. **The service validates it: `/^[A-Za-z0-9_-]{1,32}$/`, rejected as a 400.**
   This follows directly from (2). A caller-controlled string that enters 16
   route paths and a storage key is the service's problem, and the character
   class is what survives a URL path segment, a log grep and a filename without
   escaping. The length bound keeps a prefixed id readable at a glance in a
   traffic capture, which is most of the point of having one.

4. **One minter, `lib/mint-exchange-id.ts`, called from all three
   `createExchange*` functions.** Three inline `crypto.randomUUID()` calls could
   drift, and a prefix honoured on two workflows and silently dropped on the
   third is worse than no prefix: the caller's correlation would hold for some
   exchanges and not others, with nothing to indicate which.

5. **No routing work.** Every `:exchangeId` route already carries the parameter
   and none of them validates it as a UUID. Verified by inspection of all 16
   routes, and pinned by a test that a prefixed id round-trips through create →
   `/protocols` → `GET` exchange detail.

## Consequences

- **Off-service tooling never needs to read this service's store.** That is the
  payoff that decided it: correlation survives the exchange record's eviction,
  needs no credential, and works on a capture taken from the wire.

- **A caller-controlled string is now inside 16 route paths and a Keyv key.**
  Stated plainly because it is the real cost. The mitigation is the validation
  in (3), and it has to stay at the boundary: `mintExchangeId` is deliberately
  total and does not sanitise, because a minter that quietly repaired a bad
  value would hide a validation gap instead of failing on one.

- **The prefix is visible to every counterparty**, in the QR code and in every
  URL. Accepted, one-way, and judged mildly useful — it makes a live traffic
  capture readable at a glance. A caller must not put anything sensitive in it,
  which the character class and length bound already discourage.

- **`<prefix>-<uuid>` is a parsed format now.** Readers split on the first
  hyphen after the prefix and take the UUID half; the prefix character class
  excludes nothing that would make that ambiguous, but the shape is a contract
  and changing the separator would break every reader.

- **Uniqueness is unchanged.** The UUID half is untouched, so a prefix
  contributes readability and nothing to collision resistance — and two
  exchanges sharing a prefix is the normal case, not a fault.

- **The batch endpoint (`POST /exchange`) does not accept a prefix.** It builds
  its create payloads from an explicit field list and has `retrievalId` for
  correlation within a batch. Adding it there is possible and unclaimed.

## Alternatives considered

- **`variables.retrievalId`.** Rejected: lives only in the store, so it does not
  reach the wire, and it is already load-bearing for batch correlation.
- **`variables.metadata`.** Rejected for the same store-only reason, with the
  extra problem that it is untyped and unvalidated.
- **A separate correlation header echoed on responses.** Rejected: it appears
  only on the exchanges the caller itself makes, and not on the wallet's
  subsequent requests, the discovery URLs, or the device log — which is where
  correlation is actually needed.
- **Passing the value through untouched under a caller-facing name.** Rejected
  with the naming ruling in (2): the service does not pass it through, it
  consumes it, and the name it hid — that validation is the service's job — was
  the actual reason to reject the framing.
