# OID4VP 1.0 Verifier Binding

This service implements the **verifier** side of
[OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
on top of the existing `verify` exchange. A wallet can present a Data
Integrity credential to a `verify` exchange over OID4VP — in addition to
the existing VC-API / VPR / CHAPI paths — using the exchange's existing
credential-type configuration (`vprCredentialType`, `vprClaims`,
`trustedIssuers`, `challenge`).

The binding is deliberately minimal and 1.0-native:

- **Two query languages, selected per exchange** — DCQL (the OID4VP 1.0
  native language, and the default) and DIF Presentation Exchange
  (`presentation_definition`, embedded by value). See
  [Query languages](#query-languages) below. `presentation_definition_uri`
  (by reference) is not emitted.
- **Unsigned request, `redirect_uri` client_id prefix** (§5.9.3) — the
  verifier is identified by the URL the response is posted to; all
  metadata travels inline in `client_metadata`. No asymmetric
  request-object signing infrastructure is required.
- **`direct_post`** (§8.2) — the wallet HTTP-POSTs the `vp_token` back to
  the verifier.

The presented VP is verified by the **existing** `verifier-core` pipeline
(`preparePresentationForVerify` → `participateInVerifyExchange`), so the
exchange finalizes to `complete` / `invalid` / `active` (async Open
Badges pass) exactly like the VC-API path, and existing polling clients
continue to work unchanged.

## Endpoints

Both endpoints are scoped per-exchange (verify workflow only) and
unauthenticated — security is bound to the unguessable exchange id plus
the single-use `state` and `nonce`, mirroring the OID4VCI endpoints.

| Endpoint                 | Method | Path                                                             |
| ------------------------ | ------ | ---------------------------------------------------------------- |
| Authorization Request    | `GET`  | `/workflows/verify/exchanges/:id/openid4vp/request`              |
| direct_post Response     | `POST` | `/workflows/verify/exchanges/:id/openid4vp/response`             |

The wallet-facing entry point is the `OID4VP` field on the exchange's
protocols object — an
`openid4vp://?client_id=...&request_uri=...` deep link (delivered "by
reference" to keep the QR payload small, §5.7).

### ⚠️ `?protocolProfile=` on `request_uri`

The `request_uri` may carry `?protocolProfile=<name>`, and the request object is
then built under that **registered** protocol profile for that one fetch.

```
…/openid4vp/request?protocolProfile=oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier
```

⚠️ **The pin rides here, inside `request_uri`, and not on the deep link.** This
route reads the profile at fetch time, so a deep link pinned only on the outside
would advertise a `request_uri` that serves the exchange's default — a QR whose
bytes disagree with the name that built it.

⚠️ **Nothing is persisted, and an unpinned fetch is unchanged.** The parameter is
inert when it names the construction the exchange already serves. Unknown name →
**400**; a by-value profile → **400** (there is no fetched URL for it to ride
on); an exchange carrying a knob, naming its own profile, or answering under a
different response-bound axis → **409**. See
`docs/protocol-profiles.md` § Render-time selection and
`docs/adr/2026-08-25-render-time-protocol-profile-election.md`.

⚠️ **`request-served` journals the ELECTED profile**, and reads `delivery`,
`queryLanguage` and `requestObjectFormat` from it. Left reading the active
profile the line would report one construction beside another construction's
bytes.

## Flow

```
                                +-----------------------------------+
                                | POST /workflows/verify/exchanges  |
                                |  ↳ creates verify exchange        |
                                +-----------------------------------+
                                          │
                                          ▼
                                 protocols.OID4VP is
        openid4vp://?client_id=redirect_uri:<...>/openid4vp/response&request_uri=<...>/openid4vp/request

  Wallet                                                 dcc-transaction-service
  ──────                                                 ────────────────────────
   1. follow the deep link's `request_uri`
       GET /openid4vp/request
       ◄──── unsigned JSON authorization request (see below); `state` minted lazily on first GET

   2. build a Data Integrity VP that binds
        proof.challenge = request.nonce
        proof.domain    = request.client_id
      embedding the credential(s) that satisfy the DCQL query

   3. POST the vp_token back (direct_post)
       POST /openid4vp/response
         Content-Type: application/json (or application/x-www-form-urlencoded)
         { "vp_token": { "<queryId>": [ <VP> ] }, "state": "<echoed state>" }
       ◄──── 200 {}  (or { "redirect_uri": "<configured redirectUrl>" })
```

## Authorization request

Served as **unsigned** `application/json` with `Cache-Control: no-store`
(the `redirect_uri` prefix forbids signing).

```jsonc
{
  "response_type": "vp_token",
  "response_mode": "direct_post",
  "client_id": "redirect_uri:https://verifier.example/workflows/verify/exchanges/<id>/openid4vp/response",
  "response_uri": "https://verifier.example/workflows/verify/exchanges/<id>/openid4vp/response",
  "nonce": "<exchange.variables.challenge>",
  "state": "<opaque, single-use>",
  "dcql_query": {
    "credentials": [
      {
        "id": "credential",
        "format": "ldp_vc",
        "meta": {
          "type_values": [["https://www.w3.org/2018/credentials#VerifiableCredential"]]
        },
        "claims": [ /* only present when the exchange has vprClaims */
          { "path": ["credentialSubject", "achievement", "name"], "values": ["…"] }
        ]
      }
    ]
  },
  "client_metadata": {
    "vp_formats_supported": {
      "ldp_vc": { "proof_type_values": ["DataIntegrityProof"],
                  "cryptosuite_values": ["eddsa-rdfc-2022", "ecdsa-rdfc-2019"] },
      "ldp_vp": { "proof_type_values": ["DataIntegrityProof"],
                  "cryptosuite_values": ["eddsa-rdfc-2022", "ecdsa-rdfc-2019"] }
    }
  }
}
```

### Query languages

The authorization request carries **exactly one** query language. A request
with both would leave the wallet to choose and make the response ambiguous;
one with neither asks for nothing. The schema rejects both cases at build
time rather than on the wire.

Select it per exchange at creation:

```jsonc
{ "variables": { "oid4vpQueryLanguage": "pex" } }   // default: "dcql"
```

**Per-exchange, not global.** One test run must be able to exercise a DCQL
exchange and a PEX exchange minutes apart, with no service restart and no mode
leaking between them. The chosen language is stamped on
`variables.oid4vp.queryLanguage`, so an exchange record always states which
language it used rather than leaving it implicit.

**Why PEX exists here at all.** The reference holder in our interop test
suite speaks Presentation Exchange only, so a DCQL-only verifier cannot
self-test the OID4VP present leg at all. Serving both also makes it possible
to ask a wallet the same question twice and compare — which is how a wallet
that applies a `type` constraint but ignores a `format` constraint gets
caught.

**PEX mapping**, chosen to mirror the DCQL mapping so the two express the
same request:

| Verify variable | PEX target | Notes |
| --- | --- | --- |
| — (constant) | `constraints.fields[0]` on `$['type']` | `contains: { const: "VerifiableCredential" }` — the analogue of DCQL's constant `meta.type_values` |
| `vprClaims[]` | `constraints.fields[]` | one field per claim; `path` is the same segments DCQL consumes, rendered as a bracket-notation JSONPath |
| `vprClaims[].values` | `filter.enum` | omitted entirely when the claim carries no values |
| — (capability) | `format.ldp_vc.proof_type` | the accepted **proof types** (`DataIntegrityProof`, `Ed25519Signature2020`); **independently suppressible** so type and format constraints can be varied separately |

PEX `proof_type` takes proof-type names — the value of a credential's `proof.type` — and **not**
cryptosuite names. Cryptosuites travel in `client_metadata.vp_formats_supported`, which splits
`proof_type_values` from `cryptosuite_values`. This once emitted the cryptosuite list here, which
asked for a proof whose *type* was `eddsa-rdfc-2022`; no credential has that, so a wallet honouring
the format constraint could match nothing and one ignoring it was unaffected — the defect presented
as the better-behaved wallet failing.

Bracket notation (`$['a']['b']`) is used rather than dotted, because a path
segment may legitimately contain a `.` and `$.a.b` would then be ambiguous.

### DCQL mapping

| Verify variable        | DCQL target                        | Notes                                                                 |
| ---------------------- | ---------------------------------- | --------------------------------------------------------------------- |
| —                      | `meta.type_values` (**constant**)  | Always `[["https://www.w3.org/2018/credentials#VerifiableCredential"]]` |
| `vprClaims`            | `credentials[].claims`             | 1:1 (`path`, optional `values`); the `claims` key is omitted when empty |
| `vprCredentialType`    | — (**not** in the query)           | See below                                                             |
| `vprContext`           | — (post-verification only)         | DCQL `ldp_vc` meta has no `@context` filter                           |
| `challenge`            | request `nonce`                    | Binds the VP proof challenge                                          |
| `client_id`            | VP proof `domain` / `aud`          | Enforced by the response handler (§14.1.2)                            |

`vprCredentialType` (e.g. `OpenBadgeCredential`) is **intentionally not**
put in `meta.type_values`. Per OID4VP §B.1.1 the `type_values` are the
fully-expanded type IRIs after `@context` expansion; every VCDM
credential expands to the base `VerifiableCredential` IRI, so the query
is a constant. Specific credential-type and claims enforcement stays
**post-verification** (as it already is for the VC-API path) and via the
DCQL `claims` derived from `vprClaims`. Likewise `vprContext` cannot be
expressed in DCQL `ldp_vc` meta and remains a VC-API-only / post-verify
constraint.

## direct_post response (DCQL)

With DCQL the `vp_token` is a JSON **object keyed by the credential-query
`id`**, each value a non-empty array of presentations. There is **no
`presentation_submission`**. Accepted as JSON or form-urlencoded (in a
form post `vp_token` is a JSON string and is parsed first).

```jsonc
{ "vp_token": { "credential": [ { /* Data Integrity VP */ } ] }, "state": "<echoed state>" }
```

The VP proof MUST bind:

- `challenge` (or `nonce`) = the request `nonce` (= `exchange.variables.challenge`)
- `domain` (or `aud`) = the full request `client_id` string

The raw signed VP is passed byte-for-byte to `verifier-core` (it is never
Zod-transformed), which validates the `challenge` cryptographically.
`verifier-core` does **not** enforce the proof `domain`, so the response
handler enforces the `domain`↔`client_id` audience binding itself before
running verification.

## Wallet error responses

A wallet that cannot or will not satisfy the request may POST an **OID4VP error response** to the
same `response_uri` instead of a presentation (§5.10 — the error is returned in the same manner as
the authorization response). This service accepts it:

```jsonc
{ "error": "access_denied", "error_description": "No matching credentials found", "state": "<echoed state>" }
```

- Bound by the same single-use `state` guard as a presentation; an unbound error report is rejected
  with `400 invalid_request` exactly as an unbound presentation is.
- The wallet's `error` / `error_description` are journalled **verbatim** — that is the wallet's own
  diagnosis, and it exists nowhere else.
- The exchange terminates as `invalid`. `ExchangeState` has no arm for "the counterparty declined",
  and the journal carries that distinction rather than the state.
- Answered `200 {}`. No `redirect_uri`: that URL is where a *completed* exchange sends the user.

`error` is accepted as any non-empty string, not just the codes this verifier emits — a wallet may
send OAuth's, OID4VP's or its own profile's, and the unanticipated report is the valuable one. A
body carrying **both** `error` and `vp_token` is neither message and is rejected: this is
recognition of a distinct conformant message, not a shape-sniffing rescue of a malformed one.

## Security / binding

- **Unauthenticated endpoints**, bound to the unguessable exchange id.
- **`state`** — an opaque, single-use correlation token minted lazily on
  the first `request_uri` GET, echoed on the response, and consumed once
  (replay guard). Stored inline under `variables.oid4vp`.
- **`nonce`** — reuses the exchange's own `challenge` (no second nonce is
  minted); verified cryptographically against the VP proof.
- **`domain`** — the response handler requires the VP proof `domain` to
  equal `client_id`.
- A `complete` exchange rejects further responses with `400`.

## Errors

| Failure                                              | Status | Body                                        |
| ---------------------------------------------------- | ------ | ------------------------------------------- |
| Malformed / missing DCQL `vp_token`                  | `400`  | `{ "error": "invalid_request" }`            |
| Missing / wrong `state`, or already-answered request | `400`  | `{ "error": "invalid_request" }`            |
| No presentation, `domain` mismatch, or bad VP shape  | `400`  | `{ "error": "invalid_presentation" }`       |
| Exchange already `complete`                          | `400`  | `{ "error": "invalid_request" }`            |
| A conformant wallet error response (bound `state`)   | `200`  | `{}` — accepted, see above                  |

Both endpoints set `Cache-Control: no-store`.

## The request-object envelopes

The `request_uri` response can be served in **two envelopes**, chosen by the
active [protocol profile](protocol-profiles.md):

| profile | media type | body | conformant? |
|---|---|---|---|
| `oid4vp-1.0-json-by-reference-*` | `application/json` | the request object as plain JSON | no |
| `oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier` | `application/oauth-authz-req+jwt` | `<header>.<payload>.<signature>` — three segments, **non-empty** signature | ⚠️ **yes — see below, and note that conformant is not the same as accepted** |

⚠️ **A JWT served here is always a signed one**, so nothing downstream has to ask
which kind it received. The signature segment being non-empty is still asserted
explicitly in `src/oid4vp/signed-request-object.app.test.ts`: a signed object
that lost its signature would still parse as a JWS.

### ⚠️ There is no `alg: none` arm, and there must not be one

A third envelope is conceivable here and is not served: an unsigned
request-object JWT (`<header>.<payload>.` — three segments, empty signature)
under `application/oauth-authz-req+jwt`, carrying a maximal accommodation bundle
(both query languages in one object, the prefixed `client_id` **and** the
retired `client_id_scheme`, `require_signed_request_object: false`,
`expected_origins`, and `request_uri_method: post`).

The pull towards it is real: a shipping verifier emits exactly that, and a
wallet may resolve it where the same wallet does not resolve the raw JSON arm.
That buys **interoperability and nothing else** — such an arm could never be
claimed as conformant, and this service does not emit a construction no
published version permits.

⚠️ **The lineage is written down because it is the part that keeps being
re-derived**, and a reader who works it out again will propose the arm again:

- **§5.10.1**, in 1.0-final **and in draft 21 verbatim**: the `request_uri`
  response body MUST be *"a **signed**, optionally encrypted, request object."*
  ⚠️ **No draft ever carved out `alg: none`.**
- **§5.9.3**: `redirect_uri` requests *"cannot be signed"*, and *"implementations
  requiring signed requests cannot use the `redirect_uri` Client Identifier
  Prefix."* ⚠️ **The spec's own resolution is "do not combine these two" — not
  "sign it with `none`."**
- ⚠️ **The JAR lineage, written once.** `alg: none` is an **OIDC Core §6.1**
  legacy affordance — a request object *"MAY be signed or unsigned (plaintext) …
  indicated by use of the `none` algorithm"* — that **RFC 9101 (JAR)
  deliberately removed** (*"MUST be one of: (a) JWS signed (b) JWS signed and
  JWE encrypted"*). **OID4VP inherits JAR.** Reading only §5.10.1 leads to the
  reasonable-but-wrong conclusion that some draft must have allowed it.

⚠️ `alg: none` does **not** *"resolve the spec contradiction"*. The
contradiction is real; changing the **prefix** is what resolves it, which is
what the signed arm below does.

Two details of that bundle are worth knowing, because either could be proposed
on its own:

- ⚠️ **Stating `require_signed_request_object: false` would be deliberate**, not
  incidental. It is JAR's own knob — the exact metadata value RFC 9101's
  security consideration names — and stating it is the difference between a
  verifier that missed the rule and one opting out in the vocabulary the rule
  provides. The profile field stays three-valued
  (`omitted` / `declared-false` / `declared-true`) for that reason.
- ⚠️ **Advertising `request_uri_method: post` obliges the route to answer POST.**
  Advertising a fetch method the route refuses spends a wallet's attempt on a
  405 unrelated to the construction being exercised. ⚠️ And the POST form has a
  limit worth stating up front rather than hiding: the response cannot be
  tailored per wallet, so `wallet_metadata` and `wallet_nonce` would be accepted
  and **ignored**.

The `request-served` journal line records the HTTP **method** the wallet used,
so "took the POST option", "ignored it", and "never read it" stay
distinguishable afterwards.

## The signed request object — the conformant arm

⚠️ **Conformant on the fetchable path. Unproven against any wallet.** Those are
two columns in every table this section produces and they are never merged.

### Why a different client_id prefix, and not a signature on the old one

The contradiction the JSON arm lives with is a property of the
**`redirect_uri` prefix**, not of by-reference delivery. §5.9.3 says so itself:
such requests *"cannot be signed"* and *"implementations requiring signed
requests cannot use the `redirect_uri` Client Identifier Prefix."* **This arm is
taking the spec's own advice** — it changes the prefix, and by-reference
delivery becomes conformant.

| parameter | value |
|---|---|
| `client_id` | `decentralized_identifier:` + the **entity's** DID |
| media type | `application/oauth-authz-req+jwt` |
| JOSE header | `{"alg":"EdDSA","typ":"oauth-authz-req+jwt","kid":"<from the published document>"}` |
| `client_metadata.require_signed_request_object` | `true`, **stated**, and true |
| `client_id_scheme` | **absent** — the draft had no spelling for this prefix to duplicate |
| query language | `dcql_query` only |

### ⚠️ It is an ENTITY identity, not "the issuer DID"

The DID identifies the **organisation**, whatever it is acting as. Some
organisations verify only, some issue only; the signing service signs on their
behalf either way, and a verifier-only organisation uses the same identifier
unchanged. The `TENANT_ISSUER_<n>_*` environment spelling is a misnomer that
cannot be renamed without breaking every deployment's `.env`;
`src/lib/entity-identity.ts` is the boundary where it stops. **Do not call it
the issuer DID in a verifier context.**

### ⚠️ EdDSA is forced, and it may make this arm LESS interoperable

`dcc-signing-service`'s `did:web` driver cannot express a P-256 verification
method, so a `did:web` tenant signs Ed25519 and nothing else. **ES256 is the
de-facto default for OID4VP request-object signing in the mDL/EUDI world**, and
a wallet declares what it accepts via
`request_object_signing_alg_values_supported`.

⚠️ **So the conformant arm may prove less interoperable than the default JSON
arm.** That is an outcome to measure and never to assume in either
direction. A wallet refusing an EdDSA-signed request object is **not** evidence
about our conformance, and a refusal here is a finding rather than a failure: it
establishes that the conformant path is unreachable for that wallet with our
current key type.

### Where the signature comes from, and what that couples

The JWS is produced by `dcc-signing-service`, which is **the only component that
derives both the published DID document and the signing key from one seed**. It
reads the JOSE `kid` off the document its own `did.json` endpoint serves rather
than composing one. A key held in this service instead would be gap H1 across a
service boundary: a published document saying one thing, a configured seed
producing another, and nothing comparing them.

The transaction service sends the claims and serves the returned bytes
**verbatim** — it does not parse, re-serialize or rebuild them.

⚠️ **The price, paid knowingly: the `request_uri` response now depends on the
signing service being reachable while a wallet is fetching, mid-exchange.** An
outage would otherwise present to the operator as a wallet refusal — a fault of
ours presenting as a product's failure, which this service must never allow.
Three rules follow:

- **Never a silent degrade.** There is no unsigned fallback on any path. A
  delivery that quietly becomes another arm changes a second variable in a
  comparison meant to change one, and reports the wrong answer; here it would
  additionally serve an unsigned object under a profile whose name claims a
  signature.
- **A named, legible failure.** A `502` carrying the signing-service URL and the
  upstream cause, plus an `error` line in the journal with the upstream status
  and body verbatim.
- ⚠️ **The upstream's own 4xx is never forwarded to the wallet.** A `400` from
  the signing service means *we* sent something unsignable; telling a wallet its
  request was bad would be false. It becomes a 502 like everything else, and the
  diagnosis lives in the journal.

`src/oid4vp/signed-request-object.app.test.ts` drives this end to end — mint,
fetch, media type, non-empty signature, `alg`, `client_id` prefix, and that the
`kid` resolves in the published document — so a regression surfaces in CI rather
than on the wire. A deployment check should assert the same properties against a
running signing service, because none of it can be verified from the code alone.
A tenant that cannot serve the arm (no entity identity, or a `did:key` one) is
refused at mint with a named error; no tenant being able to serve it means the
deployment cannot offer this arm at all.

### What a refusal would mean

⚠️ **If a wallet refuses this, the first question is whether the refusal is
about the ALGORITHM or about the PREFIX.** They are different findings:

- *algorithm* — the wallet resolved the DID, found an Ed25519 key, and would not
  accept `EdDSA`. The conformant path is reachable for it only with a P-256 key.
- *prefix* — the wallet does not implement `decentralized_identifier` at all, and
  the algorithm never came into it.

The wallet's own error text is usually the only channel that distinguishes them,
and none of it reaches this service — it exists only on the device screen.

## Out of scope (deferred follow-ups)

- **A P-256 / ES256 signed request object.** ⚠️ The signed arm below exists but
  its algorithm is forced to EdDSA; ES256 would be a new key, a new published
  document and a separate decision. See the interop risk on that section.
- **Signing under a `did:key` entity identity.** ⚠️ It has no document at a URL,
  so there is nothing for a wallet to resolve the `kid` from. A deployment whose
  tenants are all `did:key` **cannot serve the conformant arm at all**, and no
  decision exists for that yet.
- **`direct_post.jwt`** — encrypted responses / JARM.
- **`presentation_definition_uri`** — the definition is embedded by value only.
- **OAuth "authorization code flow" for OID4VP** — does not exist in
  OID4VP 1.0 (that flow belongs to OID4VCI).

## State storage

OID4VP runtime state — the single-use `state` token and the
`responseReceived` replay flag — lives inline on the exchange record
under `variables.oid4vp`, bounded by the exchange's own TTL. The
`nonce` is not stored separately; it is the exchange's `challenge`.
