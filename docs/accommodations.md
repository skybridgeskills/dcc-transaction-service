# Accommodations

An **accommodation** is a construction this service serves _in addition to_ the
strict one, because a client that exists cannot complete the exchange against
the strict construction alone.

This document is the register of them: what is served, whether serving it is
sanctioned by a published spec, and what it costs to read a result gathered on
the accommodated route. It is prose, not data — nothing here is loaded at
runtime, and each accommodation is a live behaviour in `src/` independent of
this file.

⚠️ **An accommodation this service does not serve keeps its entry here.**
Declining to serve one is a decision, and the reasoning is what the next person
to meet the same client behaviour needs — without the entry they would rebuild
both the accommodation and the argument against it. Such an entry says what the
construction is, what it would buy, and why it is refused anyway; there is no
code behind it.

## The two distinctions that do the work

**Dialect or concession.** A **dialect** is a second construction that some
published spec sanctions: a client electing it is conforming, and so are we.
A **concession** is a construction no spec sanctions. We serve it anyway,
because it is interoperable where the strict arm is not — but a result gathered
on a concession cannot be read as evidence that the client does the strict thing
when obliged to.

**Elective or variant.** An **elective** accommodation is live in the _same_
exchange as its strict alternative, so the client's choice is visible on the
wire. A **variant** is mutually exclusive with the strict form — the two cannot
both be live and still tell you anything — so it costs a separate exchange to
observe.

Two rules follow:

- **The strict alternative stays live.** Every accommodation below keeps its
  strict route reachable and exercised. An accommodation that quietly became the
  only working route would have destroyed the thing it was measured against, and
  the tests pin this.
- **An accommodated route records itself, never the strict event it stands in
  for.** The journal writes `accommodation-served` and _not_ the
  `discovery-served` (or equivalent) line the strict route would have written.
  Serving a concession therefore does not manufacture the behaviour it
  substitutes for; the absence of the strict line survives. See
  [the exchange journal](../README.md#exchange-journal) and
  [ADR 2026-08-26](adr/2026-08-26-accommodated-routes-record-themselves.md),
  which is also where the case for _wanting to know_ which products take
  accommodations is made.

## The register

### `issuer-metadata-dual-construction` — dialect, served

Issuer and authorization-server metadata are served under **both** well-known
constructions: the RFC 8414 / RFC 8615 path-suffix form
(`/.well-known/openid-credential-issuer/<issuer path>`) and the OIDC-Discovery
concatenation (`<issuer path>/.well-known/openid-credential-issuer`). Same
handlers, same document, both live in the same exchange
(`src/hono.ts`, the well-known route block).

Elective and free. Both constructions are published specs, so which one a
client fetches is **product information rather than a defect** — either election
is conforming, and neither costs the other anything. This is the cheapest kind
of accommodation: no separate arm, no interpretation penalty.

### `token-endpoint-by-convention` — concession, served

Accept a token request `POST`ed to a path **constructed** by appending to
`authorization_servers[0]`, from a client that never fetched
`.well-known/oauth-authorization-server`.

RFC 8414 mandates discovery and constructing the endpoint is a guess, so this is
a genuine concession, not a dialect. Some clients construct the token endpoint
this way instead of performing RFC 8414 discovery, and never fetch the
authorization-server metadata at all. Without this route, everything downstream
of the token is unreachable for such a client — the exchange ends at a `404`
that was already decided by the metadata fetch.

Serving it costs the finding nothing, because of the recording rule above: the
accommodated route writes `accommodation-served` and never `discovery-served`,
so the record still shows that no discovery fetch happened. See
`src/hono.ts` (`oid4vciTokenByConvention`).

### `presentation-query-language-selector` — dialect, served

The authorization request carries either a **DCQL** query or a
**`presentation_definition`**, selected per exchange
(`oid4vpQueryLanguage: 'dcql' | 'pex'`, `src/schema.ts`). A wallet that reads
only one would otherwise fail before presenting anything.

A variant rather than an elective — the two are mutually exclusive on the wire,
so recovering which one a wallet can read costs a separate exchange. But both
are published query languages, so a wallet conforming to either is conforming,
and serving both sanctions nothing it should not.

### `presentation-format-filters-relaxed` — concession, **proposed and never built**

Relaxing format-level `proof_type` filters in the presentation query, for
clients that ignore filters they do not recognise rather than failing on them.

**Recorded here as considered and not built.** It was never served. The reason
it stayed proposed is worth keeping: silently ignoring a _format_ constraint
while still applying a _type_ constraint is a contradiction rather than a
narrowness — it is sanctioned by nothing, and unlike the concessions above it
elects inside the wallet and never surfaces on the wire, so it could not even be
observed without varying it deliberately.

### `unsigned-jwt-request-object` — concession, ⛔ **not served, and must not be**

⛔ **This service does not serve an unsigned request-object arm and there is no
code for one.** The entry stands here because the next person to meet the same
wallet behaviour needs to find the reasoning rather than rebuild it.

**What it would be.** The `request_uri` response served as an unsigned
request-object JWT — `{"alg":"none","typ":"oauth-authz-req+jwt"}`, empty
signature segment, media type `application/oauth-authz-req+jwt`, under a
`jwt-unsigned` request-object format, carrying a maximal bundle: both query
languages in one object, the prefixed `client_id` **and** the retired
`client_id_scheme`, `require_signed_request_object: false`, `expected_origins`,
and `request_uri_method: post`.

**Why it is not conformant, and this is settled.** OID4VP §5.10.1 requires
the `request_uri` response to be a _signed_ request object, verbatim in 1.0-final
and in draft 21; no draft ever carved out `alg: none`. §5.9.3 says `redirect_uri`
requests cannot be signed and that implementations requiring signed requests
cannot use that client-identifier prefix — the spec's own resolution is _do not
combine these two_, not _sign it with `none`_. ⚠️ The lineage keeps being
re-derived, so it is written down in `src/oid4vp/request-object-jwt.ts` and in
[the verifier doc](oid4vp-1.0-verifier.md): `alg: none` is an OIDC Core 6.1
legacy affordance that RFC 9101 (JAR) deliberately removed, and OID4VP inherits
JAR.

**Why serving it anyway is still not enough.** It is interoperable where the
strict arm is not: some clients resolve a JWT envelope and not raw JSON. That is
true and it is not in dispute. It does not pay for the standing cost — this
service knowingly emitting a construction no published version permits — and
there is nothing else on the other side of the ledger. The conformant signed arm
is the only request-object JWT this service serves. See
[ADR 2026-08-25](adr/2026-08-25-oid4vp-request-object-envelopes.md) §2, which
says why an unsigned envelope is not an option.

⚠️ **A known limit, for anyone proposing it again:** the `POST` form of
`request_uri_method` cannot tailor the response per wallet, so it would accept
`wallet_metadata` and `wallet_nonce` and ignore both, carrying no
`wallet_nonce`.

### `pex-limit-disclosure-preferred` — concession, served

On the PEX arm, `constraints.limit_disclosure` may be served as `preferred`
instead of the default `required`, per exchange (`limitDisclosure`,
`src/oid4vp/pex.ts`). **The default remains `required`.**

Both values are valid in DIF PEX, but this is still a concession and it is not
conformance-neutral: `required` is the only form that _binds_ a wallet to narrow
its disclosure, while `preferred` lets it decline without violating the request.
A result gathered on the `preferred` arm therefore cannot be read as evidence
that a wallet narrows when obliged to.

It exists because some clients reject `limit_disclosure: 'required'` outright
with `invalid_request`, which would otherwise leave no narrowing observation for
such a client at all. The refusal itself is informative; this arm only buys a
second, weaker observation beside it.

### `token-endpoint-inline` — concession, served, **default off**

Publish `token_endpoint` **inline** in the Credential Issuer Metadata document,
in addition to `authorization_servers`, for a client that reads only the issuer
metadata and never performs RFC 8414 authorization-server discovery. Per-exchange
opt-in (`oid4vciTokenEndpointInline`, `src/schema.ts`); **default off**, pinned
off by test.

**Why it is a variant and default-off is the whole design.**
`token-endpoint-by-convention` above keeps its discriminating power because
_constructing_ a URL is an aberrant act that still leaves no discovery fetch
behind. Reading an inline `token_endpoint` is, by contrast, entirely correct
behaviour. Serving it on every exchange would make every client look conformant
and erase the observation for all of them at once — so it costs a separate arm,
and it is never on by default.

When it is opted into, the inline value is asserted byte-identical to the
`token_endpoint` the authorization-server metadata names, so the accommodation
cannot become a second source of truth.

⛔ **Built, tested and refuted as a fix.** Publishing the endpoint inline does
not, on its own, unblock a client that never reaches the token request: this
accommodation was built, served, and changed nothing. It is kept here, default
off, because the refutation is worth more than the removal — the next person to
reach for this fix should read that it was already tried and disproved.

### `bare-vp-participate-response` — concession, served

The VC-API participate response served **bare** — a top-level
`VerifiablePresentation` carrying `verifiableCredential` — at a second address,
`…/workflows/claim/exchanges/<id>/bare-vp`, instead of wrapped in the
`{ verifiablePresentation }` envelope the strict route returns
(`participateHandler`, `src/hono.ts`).

**A concession, and nothing sanctions it.** VC-API §"Participate in an exchange"
returns the wrapped form. The bare form is what the Learner Credential Wallet's
legacy credential-request path reads: it builds a DID-auth VP, POSTs it directly
to the link's `vc_request_url`, and then looks at the response body's
**top-level** `type`. The envelope has none, so the exchange completes, the
credential is issued and signed, and the wallet stores nothing. Without this
doorway there is no DID-bound claim path into that wallet at all — its
VC-API/VCALM path classifies the exchange as a presentation request and discards
the issued VP inside the wallet, and it implements no OID4VCI.

**Elective, and the election is an address.** Both shapes are live on the same
exchange: which body you get is which URL you POST to. There is no negotiation,
no per-client state, and nothing to consult — the link the client followed *is*
the election, which is why it works for a deep link copied out of a QR that was
never rendered by our own interaction page. ⛔ The rejected alternative was
branching the strict route on the interaction page's last-shown method: that is
a payload variant rather than a route, it is wrong whenever the page was not
used, and an operator flipping the picker would poison a later VCALM POST.

**The strict route stays live and exercised.** `routes.exchangeDetail` is
unchanged and still returns `{ verifiablePresentation }`. `app.test.ts` runs a
claim against it and asserts the body carries no top-level `type` and no
top-level `verifiableCredential` — reaching it through `strictParticipatePath`,
which builds the URL from the workflow and exchange id, deliberately **not** by
reading `vc_request_url` out of the wallet link, which now points at this
doorway. `bare-vp-doorway.app.test.ts` asserts both bodies against the same
fixture and the same signed DID-auth, so the pair shows the arms differ only in
the envelope.

**What it costs to read a result here.** A completion on this doorway is not
evidence that the client speaks VC-API participate — only that it speaks the
bare form. Uptake is measurable: `accommodation-served` carrying
`accommodation: 'bare-vp-participate-response'`, against a spec-shaped
`submission` on the same exchange. ⚠️ The line is written **on arrival**, before
the DID-auth is judged, so a client that came in this door and then failed the
proof still leaves the record that it came in this door.

⚠️ **The `lcw` protocols key — and therefore `directDeepLink` and `vprDeepLink`
from batch create — point at this doorway on claim exchanges.** That is a change
to a shared API surface and it is deliberate: those are the fields
`dcc-workflow-coordinator` and `dcc-admin-dashboard` hand to a learner, and they
are exactly where the claim was failing. `vcapi` and the interaction URL are
untouched, `didAuth` and `verify` links are untouched, and
`protocol-goldens/claim-default.json` is the single fixture that moved.

⚠️ **Retirement condition, so this entry can be closed rather than
rediscovered:** a wallet that unwraps `{ verifiablePresentation }` needs nothing
here. If the Learner Credential Wallet learns to, this doorway has no remaining
client and should be removed — keeping the entry, per the rule above about
accommodations that are no longer served.

## Adding one

Before adding an accommodation, answer these in the code comment that introduces
it:

1. **Dialect or concession** — name the spec that sanctions it, or state plainly
   that nothing does.
2. **Elective or variant** — can it be live beside the strict form in the same
   exchange, or does it need its own?
3. **How the strict route stays exercised** — an accommodation whose strict
   alternative has quietly rotted is indistinguishable from a rewrite.
4. **What it costs to read a result on this arm** — for a concession, this is
   never "nothing".
