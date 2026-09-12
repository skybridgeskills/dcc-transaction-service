# Render-time protocol profile election: selecting a stored profile, never composing one

- Status: **Accepted.**
- Date: 2026-08-25
- Workflow: `verify` (and any workflow whose envelope a wallet fetches)

## Context

A client fails against a live exchange. The `state` is unconsumed, and the
operator has a construction in mind that might work instead — a registered
accommodation, a VPR without `acceptedCryptosuites`. Without an election the
only way to serve it is to **mint a new exchange**, which costs a fresh QR, a
fresh scan, and a fresh attempt from whoever is holding the phone.

So the interaction page has to be able to offer a different construction for the
same exchange. That immediately collides with a principle this repo has already
written down:

> ⚠️ **"Composition at authoring time, never at request time."**
> — `2026-08-24-protocol-profile-surface.md`, §5

A future reader finding a `?protocolProfile=` parameter on a fetched URL will
reasonably read it as that rule having been broken. It has not been, and the
distinction is the reason this ADR exists rather than a comment.

## Decision

**A fetched URL may carry `?protocolProfile=<name>`, and the bytes served for
that one request are built under that stored, total profile. Nothing is
composed, and nothing is persisted.**

### 1. ⚠️ Selection is not composition, and the difference is total definitions

§5 forbids **merging** two profiles into a third at request time, because the
bytes would then be a function of what each layer happened to be at that moment,
and *"the name stops being an answer to 'what did we send?'"*.

Render-time election does the opposite of merging. It **picks one stored, total,
already-validated definition** and serves it whole. Every byte is still
attributable to exactly one registered name — and to a *more* specific one than
before, because the name is on the URL that produced it. §5 is intact; if
anything this makes its guarantee easier to check.

⚠️ **The line to hold: an election may only ever name a registered profile.** The
moment a parameter can carry a definition, a fragment, or an override of a single
field, §5 is broken for real. `getProtocolProfile` throwing on an unknown name is
what keeps that line, and it is why an unknown name is a 400 rather than a
fallback.

### 2. ⚠️ Fetchable-only, which is the same constraint as observation-only

Only a **by-reference** construction can be elected.

> A by-reference construction has a URL that can **carry** the election. A
> by-value construction **is** the bytes — minted against a `state` at envelope
> build time — and has nowhere to put a name.

That is not a limitation discovered afterwards; it is the same fact as
non-persistence seen from the other side. An election lives on a URL for the
duration of one fetch, so a construction with no fetch cannot have one.

⚠️ **This is also what keeps `getProtocols`'s by-value `state` guard out of
reach.** That guard still throws for a mint-bound by-value exchange created
outside `createExchangeVerify`; the election path simply never arrives there, and
the refusal is asserted by its message rather than by a generic failure. **Do not
weaken, relax or route around that guard** to make an election work.

### 3. ⚠️ Non-persistence is a MECHANISM, not a promise

The elected profile reaches the resolvers as a **request-scoped shallow copy of
the exchange** carrying `variables.protocolProfileName`
(`protocol-profiles/election.ts`).

`tryResolveProtocolProfile` already reads that field as its most specific layer,
so `resolveDelivery`, `resolveQueryLanguage`, `buildAuthorizationRequest`,
`getVerifyVPR`, `getDIDAuthVPR`, `getProtocols` and `clientIdForExchange` all
honour it **with no signature change anywhere** — including resolvers not yet
written.

The rule that an election changes no record is then enforced by **where the value
lives**: it exists on a copy, for one request, and `saveExchange` is never called
with it. In `routes.oid4vpRequest` the ordering is explicit — `ensureOid4vpState`
mutates and persists the **real** exchange, and the copy is made from the result.

Rejected alternative: **thread a `profileOverride` parameter through every
resolver.** That builds a second resolution path beside the one that exists, and
every resolver added afterwards has to remember it. Rejected alternative:
**write `variables.protocolProfileName` onto the exchange.** That is a mint-time
statement, not an observation, and it makes an election change what a recorded
run cites.

⚠️ **The copy drops `variables.oid4vp.queryLanguage` and `.delivery`.** Those are
*stamped* by `ensureOid4vpState` at the first `request_uri` GET and are the most
specific layer of all — more specific than the elected profile. Left on the copy,
electing a PEX profile serves **DCQL** bytes under a name claiming PEX. A stamp
records what this exchange *was served*; the copy answers what it *would emit
under profile X*, so the stamp has no standing on it.

### 4. ⚠️ An election chooses among constructions the exchange is INDIFFERENT to

This is the sentence the four refusals share, and it is the one to keep.

| refused | status | why |
|---|---|---|
| an unregistered name | 400 | §1: an election names a stored profile or nothing |
| a by-value profile | 400 | §2: nowhere for the election to ride |
| an exchange carrying an explicit knob | 409 | knob-first precedence would honour the election only in part |
| an exchange that named its own `protocolProfileName` | 409 | the exchange has stated what it is; a test case cites that name |
| a profile differing on a **response-bound** axis | 409 | the response is validated against it, so it belongs to the exchange |

The last two are the ones a reader is most likely to want to delete.

**The mint-time profile refusal.** An exchange created with
`variables.protocolProfileName` has *stated what it is*, and anything recorded
against it is written under that name. Serving one fetch of it under something
else changes the construction under a live exchange, and nothing on the record
would say so. ⚠️ Only the **exchange** layer counts — a tenant default or
`DEFAULT_PROTOCOL_PROFILE` is deployment configuration, not a statement about
this exchange, so electing over those is exactly what this feature is for. Naming
the profile the exchange already asks for is inert, not refused, because it
changes nothing.

**The response-bound axes.** `oid4vp/response-handler.ts` parses the `vp_token`
in the language *this exchange asked in* — deliberately, rather than sniffing the
payload shape — and binds the VP proof's `domain` to `clientIdForExchange`. An
election that changed `queryLanguage` or `clientIdPrefix` would therefore serve a
request whose valid answer this service then rejects, in the exchange's own
vocabulary: **a false negative recorded against a wallet**, which is worse than
not offering the election at all. ⚠️ So *fetchable-only* and *mint-bound* are one
rule seen twice: **a construction the response is validated against is a property
of the exchange, not of one fetch.** It is chosen at mint.

⚠️ **`accepts` is not equality, and writing it as equality is a real regression.**
The question is whether the leg that reads the value can still handle what was
served. `queryLanguage: 'both'` serves each language, so it satisfies a DCQL
parser — which is what keeps a profile stating `both` electable, and that is the
likeliest kind of profile to unstick a client stuck on one language.
`OID4VP_AXIS_SCOPE` classifies **every** `Oid4vpProfileFields` key, and two tests
enforce totality, so a new field cannot be added without somebody ruling on which
side of the line it falls.

⚠️ **The knob refusal lasts only as long as the knobs; the mint-time refusal is
permanent.** Dropping the retired per-exchange knobs takes the third row with
them. The fourth row is the same intent in the newer vocabulary and outlives it —
do not delete both together.

### 5. ⚠️ An election rides on the URL that is fetched, and no further

The two fetched URLs each carry their own: `?protocolProfile=` on the interaction
URL, and one level deeper inside `request_uri` on the OID4VP arm — because
`routes.oid4vpRequest` reads the profile at **fetch** time, so a page that pinned
only the outer deep link would show a `request_uri` that serves the default.

⚠️ **The pin is deliberately not propagated into an envelope a fetched URL
serves.** A `request_uri` inside a pinned interaction envelope carries no pin and
therefore serves this exchange's own construction — which is exactly what its own
absence of a pin says. Copying the pin down would make the parameter mean *"and
everything reachable from here"*, and pinning the default's own name would stop
being byte-identical to no parameter at all.

⚠️ **`?payload=` is unchanged and orthogonal.** It names the envelope key;
`?protocolProfile=` names the construction. A preset is a UI grouping over the
two, **not a third parameter**, and every test case citing `?payload=OID4VP`
keeps working.

### 6. The election is recorded, on both the journal and the record

`interaction-method-shown` writes to the journal; `interactionMethodElections` writes to the exchange
record. The two have different readers — a caller polling `GET` sees the field, a
reader working from the durable journal after eviction sees the lines.

⚠️ **The name is derived from the payload bytes, and `source` says so.**
`payload` means the QR named it; `active` means the QR named nothing and this is
what the server resolved at that moment. Both are true, about different things,
and a later reader must be able to tell which — the same distinction
`ResolvedProtocolProfileName.source` draws.

⚠️ **The journal takes every reported interaction method; the record takes recognised
elections only.** `interaction-method-shown` takes its payload from the client, so the client
picks the bytes as well as the timing. Recognised means byte-identical to a
payload this service itself builds for an offerable preset, which bounds the set
by the offerable set. An unrecognised payload is journalled **and journalled as
unrecognised** — dropping it from the record while it appeared accepted would be
a difference no reader could see.

## Consequences

- ⚠️ **An unpinned request emits exactly what it would emit without this
  feature.** The protocol goldens pass unmodified, and a test asserts that
  pinning the default's own name is byte-identical to no parameter at all.
- **`election.ts` is a new module above the resolvers**, not part of
  `for-exchange.ts`. The refusals ask `resolveDelivery`, `resolveQueryLanguage`
  and `resolveClientIdPrefix` what an exchange responds under, and those read
  `for-exchange.ts` — so putting the refusals there makes the stack circular. The
  direction is the invariant: resolution knows nothing about elections.
- **`resolveClientIdPrefix` was split out of `clientIdForExchange`** so the
  `'redirect-uri'` default keeps one home and the refusal reads the same resolver
  the response leg calls.
- **`getProtocols` and `requestUriForExchange` take an optional `electionPin`.**
  Absent by default; every existing caller omits it.
- ⚠️ **The picker is only as informative as `DEFAULT_PROTOCOL_PROFILE`.** With no
  layer naming a profile, the active preset's `protocolProfileName` is `null` and
  the axis diff is empty — there is nothing to diff *against*. That is the honest
  encoding, not a bug: attributing bytes to a name nobody configured is the guess
  `resolveProtocolProfileName` refuses to make. A deployment that wants variant
  wording in the picker sets the app default.
- **PEX and the conformant DID arm are mint-only.** They are the two shipped
  profiles the response-bound rule excludes. Re-creating the exchange under them
  is one CLI call, and is what a test case does anyway.

## Alternatives considered

- **Document the response-leg divergence and elect anyway.** Rejected. A client
  that *did* submit under an elected PEX or DID arm would be rejected in this
  service's own vocabulary — *"this exchange asked in DCQL"* — and recorded as a
  client failure. ⚠️ **A fault in this service must never present as a product's
  failure**, and this would be exactly that, written into the durable record.

- **Re-stamp `oid4vp.queryLanguage`/`.delivery` from the elected profile so the
  response leg follows.** Rejected, and it is the tempting one. The stamp is the
  most specific resolution layer, so re-stamping makes the election **sticky**:
  every later *unpinned* fetch would serve the elected construction, and an interaction method
  whose URL names nothing would start serving something its URL does not name.
  That is the same silent lie pointed the other way — precisely the blind spot
  the picker's asymmetric mismatch check exists to catch.

- **Refuse an election on any exchange whose `state` has been minted.** Rejected:
  the motivating case *is* a wallet that already fetched the request and failed,
  so this would refuse exactly the situation the feature is for.

- **Persist the elected profile so a reload keeps it.** Rejected: it converts an
  observation into a mint-time statement and makes a UI affordance change what a
  recorded run cites. The URL already carries it, which is what makes a selection
  reproducible without the server remembering anything.

- **Let the page compose a construction from axes.** Rejected outright — this is
  the thing §5 forbids, and the reason this ADR is careful to say that selecting
  a stored profile is not that.
