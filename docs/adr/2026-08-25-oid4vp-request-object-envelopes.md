# OID4VP request-object envelopes: raw JSON, and a conformant signed JWT beside it

- Status: Accepted
- Date: 2026-08-25
- Workflow: `verify`

## Context

OID4VP's `request_uri` response is the one place this service has a real choice
of envelope, and the specification is in tension with itself about it under the
prefix this service's default binding uses:

- **§5.10.1**, in 1.0-final **and in draft 21 verbatim**: the `request_uri`
  response MUST be *"a **signed**, optionally encrypted, request object."*
- **§5.9.3**: `redirect_uri` requests *"cannot be signed"*, and *"implementations
  requiring signed requests cannot use the `redirect_uri` Client Identifier
  Prefix."* ⚠️ **The spec's own resolution is "do not combine these two."**

⚠️ **The contradiction is real and it is not resolved by an unsigned JWT.** The
tempting reading is that a JWT envelope with `alg: none` satisfies §5.10.1 while
keeping the `redirect_uri` prefix. It does not, and this is the part that keeps
being re-derived:

- ⚠️ **The JAR lineage.** `alg: none` is an **OIDC Core §6.1** legacy affordance
  — a request object *"MAY be signed or unsigned (plaintext) … indicated by use
  of the `none` algorithm"* — that **RFC 9101 (JAR) deliberately removed**: a
  Request Object *"MUST be one of: (a) JWS signed (b) JWS signed and JWE
  encrypted"*. **OID4VP inherits JAR.** ⚠️ **No OID4VP draft ever carved
  `alg: none` back out.** A reader working from §5.10.1 alone reasonably
  concludes some draft must have permitted it, and spends an afternoon finding
  out otherwise. The same lineage is written down at
  `src/oid4vp/request-object-jwt.ts` and in
  [the verifier doc](../oid4vp-1.0-verifier.md), for the same reason.

## Decision

**Two request-object envelopes, and only two: raw `application/json` under the
`redirect_uri` prefix, and a genuinely signed request-object JWT under the
`decentralized_identifier` prefix. The JSON arm is the default.**

### 1. Conformance and interoperability are separate claims, stated separately

*"A `redirect_uri` client_id cannot be passed by reference at all"* is correct
about **conformance** and wrong about **interoperability**; both sentences have
to be said, wherever an arm is described. ⚠️ Wherever this service serves
something the strict reading does not sanction, it claims interoperability and
only interoperability — in the accommodations register, in the profile
description, and in the code that serves it.

The failure being avoided is the alternative: serving a construction quietly and
letting its envelope imply conformance. **A fault in this service must never
present as a client's failure**, and a conformance claim this service has not
earned is exactly that fault in slow motion.

### 2. ⚠️ There is no unsigned-JWT arm, and there must not be one

`requestObjectFormat` is `json` or `jwt-signed`. **`jwt` means *signed*
everywhere in this service** — in the coherence rules, in the `request-served`
journal line, in every profile name — and an unsigned spelling would silently
reinterpret all of them.

A client that resolves a JWT envelope and does not resolve raw JSON is a real
shape and it will be met again. It does not buy an `alg: none` arm: no
published OID4VP version permits one, the JAR lineage above says why, and the
conformant arm of §6 is the envelope to reach for instead.

⚠️ **And do not reach for a signing library to build one.** A JOSE library that
will emit an unsigned JWS is a library configured to *accept* one, and that
configuration does not stay confined to the call site that asked for it.

### 3. `require_signed_request_object` is three-valued, never a boolean

⚠️ Stating `false` and saying nothing are different bytes and different claims.
It is **JAR's own knob** — the exact metadata value RFC 9101's security
consideration names. A verifier that states it knows the rule and is opting out
in the vocabulary the rule provides; one that omits the key has said nothing.
The profile field is therefore `omitted` / `declared-false` / `declared-true`.
The conformant arm states `declared-true`; the JSON arm omits it;
`declared-false` is coherent and unclaimed by any registered profile.

⚠️ **`declared-true` beside an unsigned envelope is a permanent contradiction**
(`require-signed-contradicts-an-unsigned-envelope`), because the metadata value
tells a client this verifier requires signed requests and the very next fetch of
`request_uri` would hand it an unsigned one. The honest positions are
`declared-false`, `omitted`, or serving `jwt-signed`.

### 4. `request_uri_method` is stated, and what is advertised is answered

⚠️ A request that advertises `request_uri_method: post` and then refuses POST
spends a client's whole attempt on a 405 unrelated to anything being tested. The
field is stated per profile — `none` means the parameter is not emitted, which
is what every registered arm states today — and whatever is stated is served.

**Known deviation, recorded rather than hidden:** the POST form of the
`request_uri` route accepts `wallet_metadata` and `wallet_nonce` and **ignores
both** — the response is not tailored per client and carries no `wallet_nonce`.
Anything advertising `post` inherits that limitation.

### 5. An envelope is chosen by protocol profile, never by a per-exchange knob

No knob on an exchange selects an envelope. The one place the choice is made is
the active profile, so the bytes are always attributable to a registered name.

⚠️ **The authorization-request schema requires *at least* one query language,
not exactly one**, because a profile may state `both`. The original argument for
exactly one — a request carrying both leaves the client to choose, which makes
the response ambiguous — still holds, and is why every single-language arm
emits exactly one and a test asserts it. A request carrying **neither** asks for
nothing and is still refused.

### 6. ⚠️ The conformant arm, and it is NOT the default

A genuinely signed request-object JWT under the `decentralized_identifier`
Client Identifier Prefix:
`oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier`.

#### 6a. The prefix is the fix, and it is the spec's own advice

⚠️ **The contradiction was never about by-reference delivery.** It is a property
of the `redirect_uri` prefix, and §5.9.3 concludes as much itself:
*"implementations requiring signed requests cannot use the `redirect_uri` Client
Identifier Prefix."* Change the prefix and by-reference delivery is conformant.
The JSON arm keeps the `redirect_uri` prefix, so it keeps the problem — which is
exactly why it stays raw JSON: an envelope on that prefix could never be a
conformant one, so adding one would buy a shape and no claim.

#### 6b. The signing locus is `dcc-signing-service`, and the DID is an ENTITY identity

⚠️ **It is not "the issuer DID."** Some organisations verify only, some issue
only; the identifier is the organisation's, whatever it is acting as, and a
verifier-only organisation uses the same one unchanged. `TENANT_ISSUER_<n>_*` is
a misnomer that cannot be renamed without breaking every deployment's `.env`;
`src/lib/entity-identity.ts` is the boundary where the wrong name stops.

The signature is produced by the signing service because it is the only
component that derives **both** the published DID document and the signing key
from one seed, and it reads the JOSE `kid` off the document its own `did.json`
endpoint serves rather than composing one. A key held in the verifier instead
would be **gap H1 across a service boundary**. The transaction service serves the
returned bytes **verbatim**; a test asserts byte-identity with the response.

The rejected alternative — a local key behind the verifier's own `did:web` —
stays available if the round trip becomes the wrong shape. The cost is one JWS
per `request_uri` GET, at most one per exchange, and the by-value arm never
fetches at all.

#### 6c. ⚠️ EdDSA is forced, and this arm may be LESS interoperable than the JSON one

The `did:web` driver cannot express a P-256 verification method, so a `did:web`
tenant signs Ed25519 and nothing else — while **ES256 is the de-facto default for
OID4VP request-object signing in the mDL/EUDI world**.

⚠️ **Conformant and accepted are two separate claims, kept separate
everywhere this arm is described**, and a client refusing an EdDSA-signed
request object says nothing about our conformance. What it establishes is that
the conformant path is unreachable for that client with our current key type. **There is no P-256 path** — that is a new
key, a new published document and a separate decision.

#### 6d. Availability coupling, designed for rather than discovered

⚠️ On this arm the `request_uri` response depends on a second service **while a
client is fetching, mid-exchange** — the worst possible moment, because a signing
outage would present to the operator as a client refusal. Three rules, none
negotiable:

1. **No unsigned fallback on any path.** A delivery that quietly becomes another
   arm has changed two variables where the comparison meant to change one, and
   here it would additionally serve an unsigned object under a profile whose
   name claims a signature.
2. **A named 502** carrying the signing-service URL and the upstream cause, plus
   an `error` journal line with the upstream status and body verbatim.
3. ⚠️ **The upstream's own 4xx is not forwarded to the client.** A `400` from the
   signing service means *we* sent something unsignable; telling a client its
   request was bad would be false and actively misleading. This is
   `upstream-call.ts`'s `OUR_FAULT_STATUSES` reasoning applied to the whole
   range, because on this call every refusal is about us.

`src/oid4vp/signed-request-object.app.test.ts` drives the whole path — including
the refusal cases — so none of this rests on inspection.

#### 6e. ⚠️ A `did:key` entity cannot serve this arm, and nothing has decided what should happen instead

A `did:key` publishes no document at a URL, so there is no `kid` for a client to
resolve and the signing service refuses it. This service refuses **at mint**,
mirroring that refusal early so the failure lands before the exchange is handed
over rather than in the middle of one — with an explicit instruction at the site
to delete the check if the signing service ever signs under a non-`did:web`
identity.

**A deployment whose tenants are all `did:key` therefore cannot serve the
conformant arm at all.** ⚠️ **No decision exists for that**, and none was invented
here. It is recorded as an open question.

#### 6f. Not the default, and conformance is not a reason to move it

⚠️ `oid4vp-1.0-json-by-reference-dcql-redirect-uri` is the default, and moving
the default needs a client that has actually **accepted** the replacement — not
merely a construction that is conformant. Conformant and accepted are two
columns. `oid4vp/state.ts` carries the same warning at the site that would be
edited to do it.

## Consequences

- ⚠️ **`Oid4vpQueryLanguage` is three-valued on the record and two-valued on the
  knob.** The record has to be able to say what actually went out; an exchange
  served under a profile stating `both` must not claim on its own record to have
  asked in one language.

- **The `request-served` journal line records the HTTP method**, so "took the
  POST option", "ignored it" and "never read it" stay distinguishable.

- ⚠️ **Two by-reference envelopes exist and only one is conformant**, so every
  table, journal line and report that names an arm has to say which. The
  `request-served` journal line records `requestObjectFormat` for this reason:
  inferring the envelope from a profile name later is a derived fact that goes
  stale the first time a profile is renamed.

- ⚠️ **`clientIdForExchange` is not a pure string builder.** It reads the active
  profile and, on the DID prefix, the tenant's entity identity — so it can throw,
  at mint. Both the request builder and the response handler's audience check
  call it, which is what keeps the `client_id` we sign and the `client_id` we
  bind the VP proof to from disagreeing.

- **`require-signed-contradicts-an-unsigned-envelope` is a permanent
  `CONTRADICTIONS` entry**, not an unbuilt-arm pin — §3. It is wrong regardless
  of what anybody builds, and the two lists are guarded as disjoint.

- **The raw-JSON arm stays live and golden-pinned.** Keeping the strict
  alternative reachable and exercised is a standing requirement of every
  accommodation this service serves — see
  [accommodations](../accommodations.md).

## Alternatives considered

- **An unsigned-JWT (`alg: none`) envelope.** Rejected — see §2. It is
  interoperable with clients that resolve a JWT and not raw JSON, and it is
  permitted by no published OID4VP version; the JAR lineage in the Context is
  why, and the conformant arm is the answer instead.

- **Reading the `redirect_uri` prefix as simply unusable by reference.**
  Rejected: that conclusion is correct about conformance and wrong about
  interoperability, which is §1's whole point. The JSON arm is served by
  reference under that prefix and says what it is.

- **Sign the request under the `redirect_uri` prefix.** Not available: §5.9.3
  forbids it. Signing needs a different prefix, which is what §6 does.

- **Make the signed arm the default.** Rejected: moving the default is a
  separate decision needing a client that accepts the replacement —
  §6f — and the golden fixtures exist to stop it happening silently.

- **Delete the raw-JSON arm now that the signed one exists.** Rejected: it is
  the baseline construction everything else is compared against, and it is the
  only arm under the `redirect_uri` prefix. An envelope that replaced the strict
  path would be a fault in this service presenting as a success.
