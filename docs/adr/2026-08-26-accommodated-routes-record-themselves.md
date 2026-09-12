# An accommodated route records itself, and never the strict event it stands in for

- Status: Accepted
- Date: 2026-08-26
- Workflow: `claim` (OID4VCI), and the accommodations register generally

## Context

An **accommodation** is a route this service serves that a strict reading of the
specification does not require — or forbids — because a client that exists
cannot complete the exchange without it. Two kinds, and the difference is the
whole reason this decision has to be made at all:

- A **dialect** is a second construction some published spec sanctions. Both
  forms are legal; a client electing either is conforming, and so are we. Which
  one it elects is _product information_, not a defect.
- A **concession** is a construction no spec sanctions. We serve it anyway,
  because it is interoperable where the strict route is not — but a result
  gathered on a concession cannot be read as evidence that the client does the
  strict thing when obliged to.

The register of what is served, and on which terms, is
[`docs/accommodations.md`](../accommodations.md).

### The condition that forces the rule

Issuer metadata for a per-exchange credential issuer carries no `token_endpoint`.
It names `authorization_servers`, and under RFC 8414 that obliges the client to
fetch `<authorization_server>/.well-known/oauth-authorization-server` and read
`token_endpoint` out of that document. We serve that document, under both
well-known constructions, and it returns `<issuer>/openid/token`.

**Some clients skip the discovery hop.** They construct the token URL by
appending `/token` to `authorization_servers[0]` instead, and a client that does
this never reaches the token endpoint at all: everything downstream of it —
nonce, proof of possession, credential delivery, the credential itself — is
decided by a 404 on a URL nothing ever advertised.

The behaviour is attributable to the client and not to the deployment, because
the strict route is live and exercised: our own reference holder discovers
correctly and completes against the same service.

So there are two obligations in tension. We want the exchange to complete, which
argues for answering on the constructed path. And we want the record to keep
saying that this client never discovered — because the absence of a discovery
fetch _is_ the finding, and the 404 is not.

## Decision

**Serve the token endpoint at the constructed path as well, from the same
handler — and make the accommodated route write `accommodation-served`, never
the `discovery-served` event the strict route would have written.**

`POST /workflows/:workflowId/exchanges/:exchangeId/token` and
`POST …/openid/token` are one handler registered twice
(`tokenEndpointHandler`, `src/hono.ts`), distinguished only by a `route`
argument that decides whether a journal line is written. Two doorways onto one
implementation, for the same reason `issuerMetadataHandler` serves both
discovery constructions: a second implementation is a second thing to keep in
step, and an accommodation that answered _differently_ would be a new behaviour
to observe rather than a way of reaching the existing one.

The generalisable half is the journal rule. A client that constructs the URL
produces no `discovery-served` line, and **that absence is the finding**. So the
accommodated route writes an affirmative `accommodation-served` line — which
accommodation, and which client took it — and writes no discovery line at all.
Serving the concession and reading the record stay separate decisions.

⚠️ The line is written **on arrival, before the grant is judged**. A client that
constructed the URL and then presented a bad code still constructed the URL, and
that is the fact the line carries.

### Why the rule matters

If a concession wrote the strict event, the durable record would show a client
doing something it never did. The journal would then report conformance we
accommodated our own way around — and the one artifact that outlives the
exchange record (which is evicted at `EXCHANGE_TTL`, ten minutes by default)
would be wrong about the very thing it exists to capture. A record that can be
manufactured by our own generosity is worse than no record, because it reads the
same as an honest one.

### Why we want to know which products take accommodations

Serving an accommodation is cheap; _knowing who takes it_ is the thing worth
paying for, and it has two payoffs.

**Product.** Accommodations are standing cost — every one of them is a second
route to keep working, to test, and to explain. Uptake is what tells us which to
keep, which to narrow to a per-exchange opt-in, and which never earned their
place. It decides real cases in both directions: `token-endpoint-inline` is
served, changed nothing for the construction it was built for, and is therefore
kept in the register **default off** with the refutation attached, precisely so
nobody builds it a second time. A concession nobody takes, or that buys nothing
when taken, is debt.

⚠️ **Uptake is not the only test an accommodation has to pass.** One that can
only work by making a false statement on the wire fails on its own terms,
whatever its uptake — see
[the advertised-acceptance rule](2026-09-10-advertised-acceptance-equals-actual.md).

**Standards.** One implementation taking a concession is a bug in that
implementation. _Several independent implementations_ taking the same one is
evidence that the specification is ambiguous, impractical, or silent at exactly
that point — and that is the kind of evidence worth carrying back to a working
group, because it is the kind nobody can gather by reading the text. The
`token-endpoint-by-convention` case above is a candidate on its face: a client
that constructs a URL RFC 8414 tells it to discover is not confused about the
URL, it is voting against the discovery hop.

Both payoffs die the moment an accommodated route can write the strict event.
Uptake becomes unmeasurable when taking the concession and doing the strict
thing leave the same trace.

### The strict alternative stays live

An accommodation that _replaces_ the strict path is not an accommodation; it is
a fork, and it has destroyed the thing it was measured against. Every entry in
[the register](../accommodations.md) states whether the strict alternative is
still served, and it must be — reachable and exercised, not merely present in
the source.

## Alternatives rejected

**Advertise a `token_endpoint` in issuer metadata for everyone.** This is the
obvious fix and it is the worst one available as a default. It makes the
constructed path the discovered path, so a client that never performed RFC 8414
discovery becomes indistinguishable from one that did — for every client at
once, retroactively. ⚠️ Note that an end-to-end reference-holder check does
**not** catch this: with the metadata repointed, the reference holder still
completes, because it discovers an endpoint that now works. Only an assertion on
the advertised value fails. This construction survives as
`token-endpoint-inline`, per-exchange opt-in and **default off**, which is the
same judgement expressed as a switch.

**Do not serve the constructed path at all.** As a standing position this trades
every downstream observation, for every client with this behaviour, against a
finding that costs nothing to keep — since the finding lives in the absence of a
discovery fetch and not in the 404.

**Mark the accommodated route as a discovery election.** Rejected: it records
the guess as the discovery it replaced, which is the failure this ADR exists to
prevent.

**Leave the journal alone and detect the route from HTTP logs.** Rejected for
the reason `src/journal/attribution.ts` exists at all: a fact that lives for one
request in some proxy's log and is then gone is not evidence. The durable
record has to carry it.

## Consequences

- `accommodation-served` joins the deliberately closed `JOURNAL_EVENTS` set
  (`src/journal/types.ts`). Its **absence means no accommodated route was
  used** — never that the strict route was not taken, which is the same reading
  convention `request-served` already carries.
- The rule generalises. The next accommodation that adds a **route** rather than
  varying a payload writes `accommodation-served` with its own id, and the
  question _"does serving this destroy the observation it was meant to
  preserve?"_ has a mechanical answer instead of a judgement.
- ⚠️ It does **not** generalise to accommodations that vary a payload on the
  route the strict form already uses — a query-language selection, a relaxed
  constraint value. Those are distinguished by the emitted bytes and by the
  profile that produced them, not by a journal event, and inventing one for them
  would make `accommodation-served` mean two things.
- **An accommodation this service stops serving keeps its register entry**, with
  what it was, why it was served and why it is not served now. Deleting the entry
  would leave the next person to meet the same client behaviour to rebuild both
  the accommodation and the argument against it. `unsigned-jwt-request-object` is
  recorded that way — the register entry, and
  [ADR 2026-08-25](2026-08-25-oid4vp-request-object-envelopes.md) §2, which says
  why an unsigned envelope is not the answer.
- Adding one is gated on answering, in the code comment that introduces it:
  dialect or concession; elective or variant; how the strict route stays
  exercised; and what it costs to read a result on this arm. The register spells
  this out.
