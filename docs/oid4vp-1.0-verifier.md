# OID4VP 1.0 Verifier Binding

This service implements the **verifier** side of
[OpenID for Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
on top of the existing `verify` exchange. A wallet can present a Data
Integrity credential to a `verify` exchange over OID4VP — in addition to
the existing VC-API / VPR / CHAPI paths — using the exchange's existing
credential-type configuration (`vprCredentialType`, `vprClaims`,
`trustedIssuers`, `challenge`).

The binding is deliberately minimal and 1.0-native:

- **DCQL only** — the OID4VP 1.0 native query language. No
  `presentation_definition` / PEX.
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

Both endpoints set `Cache-Control: no-store`.

## Out of scope (deferred follow-ups)

Tracked in the plan's `future.md` (and, where relevant, as profile
recommendations for `strada-ler-interoperability-guide`):

- **Signed request objects** (`did:web` / `did:key` request-object
  signing) — requires net-new asymmetric signing infrastructure.
- **`direct_post.jwt`** — encrypted responses / JARM.
- **`presentation_definition` / PEX** — pre-1.0 query language; DCQL only.
- **OAuth "authorization code flow" for OID4VP** — does not exist in
  OID4VP 1.0 (that flow belongs to OID4VCI).

## State storage

OID4VP runtime state — the single-use `state` token and the
`responseReceived` replay flag — lives inline on the exchange record
under `variables.oid4vp`, bounded by the exchange's own TTL. The
`nonce` is not stored separately; it is the exchange's `challenge`.
