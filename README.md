# Transaction Manager Service _(@digitalcredentials/transaction-manager-service)_

[![Build
status](https://img.shields.io/github/actions/workflow/status/digitalcredentials/transaction-service/main.yml?branch=main)](https://github.com/digitalcredentials/transaction-service/actions?query=workflow%3A%22Node.js+CI%22)
[![Coverage
Status](https://coveralls.io/repos/github/digitalcredentials/transaction-service/badge.svg?branch=main)](https://coveralls.io/github/digitalcredentials/transaction-service?branch=main)

> Hono app for managing the transactions used in [VC-API
> exchanges](https://w3c-ccg.github.io/vc-api/#initiate-exchange).

**IMPORTANT NOTE ABOUT VERSIONING**: If you are using a Docker Hub image of this repository, make
sure you are reading the version of this README that corresponds to your Docker Hub version. If,
for example, you are using the image `digitalcredentials/transaction-service:0.1.0` then you'll
want to use the corresponding tagged repo: [https://github.com/digitalcredentials/transaction-service/tree/v0.1.0](https://github.com/digitalcredentials/transaction-service/tree/v0.1.0). If you are new here, then just read on...

## Table of Contents

- [Overview](#overview)
- [API](#api)
- [Verification pipeline](#verification-pipeline)
- [Exchange journal](#exchange-journal)
- [did:web document hosting](#didweb-document-hosting)
- [Health Check](#health-check)
- [Environment Variables](#environment-variables)
- [Versioning](#versioning)
- [Contribute](#contribute)
- [License](#license)

## Overview

This is a web app with an HTTP API served using the Hono framework that:

- stores data associated with a [VC-API
  exchange](https://w3c-ccg.github.io/vc-api/#initiate-exchange) and generates an exchangeID and
  transactionID
- generates and verifies UUID challenges used in [DIDAuthentication Verifiable Presentation
  Requests](https://w3c-ccg.github.io/vp-request-spec/#did-authentication)
- verifies [DID Authentication](https://w3c-ccg.github.io/vp-request-spec/#did-authentication)
  signatures
- generates a multi-protocol query including DCC deep link and [CHAPI](https://chapi.io) wallet
  queries
- processes VC-API requests for basic credential issuance workflow.

One way of using this is behind the [DCC Workflow
Coordinator](https://github.com/digitalcredentials/workflow-coordinator), which serves as a proxy
and passes the DID authentication portion of the exchanges to this service to handle Wallet/Issuer
DIDAuth exchange prior to issuing a credential.

This package can also be used directly as a VC-API server, offering exchanges that result in the
issuance of credentials. It will support additional protocols in the future, such as OpenID for
Verifiable Credential Issuance (OIDC4VCI).

Especially meant to be used as a service within a Docker compose network, initialized by the
coordinator from within the Docker compose network, and then called externally by a wallet like the
[Learner Credential Wallet](https://lcw.app). To that end, a Docker image for this app is published
to DockerHub to make it easier to wire this into a Docker compose network.

It may be used behind a reverse proxy, and the `DEFAULT_EXCHANGE_HOST` environment variable can be
used to set the default exchange host, or exchange host values may be passed in at exchange creation time.

## API

Implements endpoints:

### `POST /exchange` - Create Exchange Batch (Basic)

Initializes a batch of exchanges of [Verifiable Credentials](https://www.w3.org/TR/vc-data-model/).
Expects an object containing the data that will later be used to issue the credentials, like so:

```
{
   exchangeHost: "hostname to use when constructing the exchange endpoints",
   tenantName: "(optional) the tenant with which to later sign the credentials",
   data: [
      {
         vc: "an unsigned populated Verifiable Credential",
         retrievalId: "an ID to later use to select the generated VPR/deeplink for this credential"
      },
      {
         vc: "another unsigned populated Verifiable Credential",
         retrievalId: "another ID to later use to select the generated VPR/deeplink for this credential"
      },
       ... however many other credentials to setup an exchange for
   ]
}
```

This endpoint returns a list of interactions to pass to a wallet such as the [Learner Credential
Wallet](https://lcw.app) to initiate the exchange.

#### Interaction page routes

| Endpoint                            | Method | Purpose                                                                                                                                                                                                   |
| ----------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/interactions/:exchangeId`         | `GET`  | Content-negotiated: the SPA shell for a browser, the protocols envelope for a wallet. Accepts `?protocolProfile=<name>` — see [render-time selection](./docs/protocol-profiles.md#render-time-selection). |
| `/interactions/:exchangeId/presets` | `GET`  | The launch presets the page may offer — server-built payloads, an axis diff, product ids. ⚠️ SPA-facing; a wallet never reads it.                                                                         |
| `/interactions/:exchangeId/method`  | `POST` | The page reporting which payload its QR is showing. Write-only, `204`, unauthenticated.                                                                                                                   |

`tenantName` is optional. When tenant auth is enabled, the tenant is derived from
the request's `Bearer` token; a body `tenantName` that disagrees with the token
tenant is rejected with `401`. When tenant auth is disabled, the body
`tenantName` (or `DEFAULT_TENANT_NAME`) is used. The same resolution applies to
`POST /workflows/:workflowId/exchanges`.

### `POST /workflows/:workflowId/exchanges` - Create Exchange (VC-API)

The endpoint stores the data in a key/value store along with newly generated UUIDs for the
exchangeId, transactionId and a challenge to be used later for a [DIDAuthentication Verifiable
Presentation Request](https://w3c-ccg.github.io/vp-request-spec/#did-authentication).

#### `exchangeIdPrefix` (optional)

A caller-supplied component of the minted `exchangeId`, sent as a **sibling of `variables`** (it is
an instruction to the id minter, not an exchange variable):

```json
{
  "exchangeIdPrefix": "ticket-4471",
  "variables": { "exchangeHost": "https://issuer.example", "vc": "…" }
}
```

The service then mints `exchangeId = "<exchangeIdPrefix>-<uuid>"` instead of a bare UUID. Omit it
and nothing changes: the id is a plain UUID, exactly as before.

Use it to correlate an exchange with a concept of your own — a ticket, a batch, a test case —
**from outside this service**. Because the value lands in the `exchangeId`, it appears in the
interaction URL and QR code, every OID4VCI/OID4VP discovery URL, all 16 `:exchangeId` routes, and
every [exchange journal](#exchange-journal) line. Correlating after the fact therefore never
requires reading this service's store, which matters because that store is evicted after
`EXCHANGE_TTL`.

- **Validated**: `^[A-Za-z0-9_-]{1,32}$`. Anything else is a `400` with problem details. The value
  ends up in URL paths and a storage key, so the rule is strict and the rejection is the service's.
- **Visible to the counterparty** — it is in every URL, including the QR code. Do not put anything
  sensitive in it.
- Not accepted on the batch endpoint `POST /exchange`; use `retrievalId` there.

See [`docs/adr/2026-08-11-exchange-id-prefix.md`](docs/adr/2026-08-11-exchange-id-prefix.md).

The endpoint returns an object with two options for opening a wallet: a custom deep link that will
open the Learner Credential Wallet and a [CHAPI](https://chapi.io) request that can be used to open
a CHAPI-enabled wallet. In both cases the deep link or CHAPI request will prompt the wallet to
submit a DID Authentication to the exchange endpoint, which will return the signed credential.

The object will look something like so, for a `claim` exchange:

```json
[
  {
    "retrievalId": "someId",
    "iu": "http://localhost:4005/interactions/993cce5e-58a8-41ce-a055-bef4a8253379?iuv=1",
    "directDeepLink": "https://lcw.app/request.html?issuer=localhost&auth_type=bearer&challenge=27485032-e0bc-4d74-bb5a-bb778cd7f8e3&vc_request_url=http%3A%2F%2Flocalhost%3A4005%2Fworkflows%2Fclaim%2Fexchanges%2F993cce5e-58a8-41ce-a055-bef4a8253379%2Fbare-vp",
    "vprDeepLink": "https://lcw.app/request.html?issuer=localhost&auth_type=bearer&challenge=27485032-e0bc-4d74-bb5a-bb778cd7f8e3&vc_request_url=http%3A%2F%2Flocalhost%3A4005%2Fworkflows%2Fclaim%2Fexchanges%2F993cce5e-58a8-41ce-a055-bef4a8253379%2Fbare-vp",
    "chapiVPR": {
      "query": {
        "type": "DIDAuthentication"
      },
      "interact": {
        "service": [
          {
            "type": "VerifiableCredentialApiExchangeService",
            "serviceEndpoint": "http://localhost:4005/workflows/claim/exchanges/993cce5e-58a8-41ce-a055-bef4a8253379"
          },
          {
            "type": "UnmediatedPresentationService2021",
            "serviceEndpoint": "http://localhost:4005/workflows/claim/exchanges/993cce5e-58a8-41ce-a055-bef4a8253379"
          },
          {
            "type": "CredentialHandlerService"
          }
        ]
      },
      "challenge": "27485032-e0bc-4d74-bb5a-bb778cd7f8e3",
      "domain": "http://localhost:4005"
    }
  }
]
```

- POST /exchange/{exchangeId}

Called by the wallet to initiate the exchange. Returns a [DIDAuthentication Verifiable Presentation
Request](https://w3c-ccg.github.io/vp-request-spec/#did-authentication) asking the wallet for a DID
Authentication

- POST /exchange/{exchangeId}/{transactionId}

Called by the wallet to complete the exchange. Receives the requested DID Authentication and returns
the signed Verifiable Credential after verifying the DID Authentication.

NOTE: `directDeepLink` and `vprDeepLink` carry the **same string**. They are kept as two fields
because existing callers read both; the one-step / two-step distinction they once named is no
longer a property of the link. A wallet may POST an empty body first to receive the
[DIDAuthentication Verifiable Presentation
Request](https://w3c-ccg.github.io/vp-request-spec/#did-authentication), or submit its DID
Authentication directly — the same endpoint answers both.

⚠️ On a **claim** exchange, the `vc_request_url` inside these links points at the `bare-vp`
accommodation doorway, which answers with a bare verifiable presentation rather than the VC-API
`{ verifiablePresentation }` envelope. The strict route is unchanged and is what `iu` and the
`vcapi` protocols key still name. See [the accommodations register](docs/accommodations.md)
(`bare-vp-participate-response`) for why, and for what a result gathered on that doorway does and
does not tell you.

- GET /workflows/:workflowId/exchanges/:exchangeId

Returns the exchange data for the given exchangeId and transactionId. If authentication is required,
an `Authorization` header with a valid tenant `Bearer` token is required. On the create endpoints the
tenant is derived from this token, so the request body `tenantName` is optional; it only needs to be
sent when tenant auth is disabled (and even then it defaults to `DEFAULT_TENANT_NAME`).

- GET /healthz

Which is an endpoint typically meant to be called by the Docker
[HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck) option for a specific
service. Read more below in the [Health Check](#health-check) section.

### OID4VCI 1.0 Pre-Authorized Code Flow

For `claim` exchanges, the service additionally exposes the [OpenID for Verifiable Credential
Issuance 1.0](https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html)
Pre-Authorized Code Flow. The wallet-facing entry point is the `OID4VCI` field on the protocols
object — an `openid-credential-offer://?credential_offer_uri=...` deep link.

- `GET /workflows/claim/exchanges/:exchangeId/openid/credential-offer` — Credential Offer JSON.
- `GET /.well-known/openid-credential-issuer/workflows/claim/exchanges/:exchangeId` — Credential
  Issuer Metadata.
- `GET /.well-known/oauth-authorization-server/workflows/claim/exchanges/:exchangeId` —
  per-exchange OAuth Authorization Server Metadata.
- `POST /workflows/claim/exchanges/:exchangeId/openid/token` — pre-authorized code grant.
- `POST /workflows/claim/exchanges/:exchangeId/openid/nonce` — single-use `c_nonce`.
- `POST /workflows/claim/exchanges/:exchangeId/openid/credential` — issuance via a `proofs.di_vp`
  Data Integrity Verifiable Presentation key proof bound to the previously-issued nonce.

Both metadata documents are **also served in the OpenID-Connect-Discovery-style
concatenated form**, with the well-known segment appended to the issuer identifier rather
than inserted after the host. A per-exchange `credential_issuer` always carries a path, so
the two constructions differ for every exchange — and wallets disagree about which to use.
Serving both means a discovery-style mismatch cannot blank out the rest of the flow.

- `GET /workflows/claim/exchanges/:exchangeId/.well-known/openid-credential-issuer`
- `GET /workflows/claim/exchanges/:exchangeId/.well-known/oauth-authorization-server`
- `GET /workflows/claim/exchanges/:exchangeId/.well-known/openid-configuration` — an interop
  alias returning the same AS metadata; it is **not** a conformant OIDC OP metadata document.

Because both constructions are served, the client's choice no longer shows up in the outcome — so
it is recorded. Each exchange carries a **`discoveryElections`** array: the construction/document
pairs it actually served, in the order they were first fetched, each with the time of that first
fetch. It is absent until something asks, and a repeat fetch of a pair already listed does not
append to it. Every individual fetch, repeats included, is a `discovery-served` line in the
[exchange journal](#exchange-journal).

```jsonc
"discoveryElections": [
  { "construction": "oidc-concat", "doc": "issuer", "at": "2026-08-11T18:05:02.441Z" },
  { "construction": "rfc8414-path-suffix", "doc": "issuer", "at": "2026-08-11T18:05:02.902Z" }
]
```

A client that fetched both and a client that fetched only one are different observations, which is
why this is a set in fetch order rather than a single value.

See [`docs/oid4vci-pre-authorized-flow.md`](./docs/oid4vci-pre-authorized-flow.md) for the full
walk-through with curl commands.

### OID4VP 1.0 Verifier Binding

For `verify` exchanges, the service additionally exposes the **verifier** side of [OpenID for
Verifiable Presentations 1.0](https://openid.net/specs/openid-4-verifiable-presentations-1_0.html)
so a wallet can present a Data Integrity credential over OID4VP. The wallet-facing entry point is
the `OID4VP` field on the protocols object — an `openid4vp://?client_id=...&request_uri=...` deep
link. The response mode is **`direct_post`**, and the presented VP runs through the same
`verifier-core` pipeline as the VC-API path. Which query language, which delivery and which
request-object envelope go out is a [protocol profile](./docs/protocol-profiles.md) field: the
default is a raw-JSON request object at `request_uri` carrying **DCQL** under the `redirect_uri`
client_id prefix, and a **conformant signed** request-object JWT under the
`decentralized_identifier` prefix is registered beside it. **DIF Presentation Exchange** is served
in place of DCQL where a profile names it.

- `GET /workflows/verify/exchanges/:exchangeId/openid4vp/request` — the OID4VP 1.0 authorization
  request (query + `client_metadata`), in the envelope the active profile names; lazily mints a
  single-use `state`. Accepts `?protocolProfile=<name>`.
- `POST /workflows/verify/exchanges/:exchangeId/openid4vp/response` — `direct_post` `vp_token`
  (DCQL object keyed by credential-query id), bound to the exchange by `state` / `nonce` /
  `client_id`↔`domain` and verified by the existing pipeline.

See [`docs/oid4vp-1.0-verifier.md`](./docs/oid4vp-1.0-verifier.md) for the request/response shapes,
DCQL mapping, and security binding.

## Verification pipeline

The verify workflow (`POST /workflows/verify/exchanges/:exchangeId`)
runs in two passes. The synchronous request thread runs verifier-core's
default suites (proof, status, registry, etc.) against the inbound
Verifiable Presentation and persists the result. If any embedded
credential is recognized as an Open Badges credential by
`@digitalcredentials/verifier-core/openbadges`'s `isOpenBadgeCredential`,
the heavier OB suite is dispatched to an in-process worker and the
exchange remains `state: 'active'` until the worker commits. Otherwise
the exchange is finalized inline to `'complete'` or `'invalid'` exactly
as before.

### Sync vs async split

| Phase | Where it runs                                                                                      | What it covers                                                                                                |
| ----- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sync  | The HTTP request handler                                                                           | Default verifier-core suites: presentation proof, credential proof, registry membership, status list, schema. |
| Async | A FIFO worker draining `enqueueVerifyTask` (one drainer per process, scheduled via `setImmediate`) | Open Badges suite (`openBadgesSuite`) per OB-recognized credential.                                           |

A successful POST returns `200 OK` once the sync pass commits — even
when an OB pass is still pending. **Downstream consumers MUST re-check
`state` on the exchange GET before granting any privilege**;
`state: 'active'` plus a populated `variables.verifyTask` means async
work is still in flight.

### `variables.verifyTask` shape

When the async pass is pending or has run, the exchange's
`variables.verifyTask` is populated:

| Field                         | Type                                                            | Meaning                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `attemptId`                   | `string` (UUID)                                                 | CAS token for the current attempt. Bumped on every retry; lets the worker detect that a sweep superseded its in-flight commit.                 |
| `attempt`                     | `number`                                                        | 1-indexed attempt counter.                                                                                                                     |
| `status`                      | `'queued' \| 'running' \| 'succeeded' \| 'failed' \| 'gave-up'` | Lifecycle of the current attempt. `'failed'` is recoverable (next sweep may retry); `'gave-up'` is terminal and pairs with `state: 'invalid'`. |
| `openBadgesCredentialIndices` | `number[]`                                                      | Indices into `variables.results.default.credentialResults` for credentials the OB suite should re-verify.                                      |
| `deadlineAt`                  | `string` (ISO timestamp)                                        | When this attempt is considered timed out. Drives the GET-driven sweep.                                                                        |
| `lastError`                   | `string \| undefined`                                           | Last worker error, included verbatim on the synthesized timeout `CheckResult` if attempts exhaust.                                             |

### GET-driven retry

There is no scheduled sweep. The GET on a verify exchange (and on
`/protocols` / `/interaction`) runs `sweepIfTimedOut`: if the task's
`deadlineAt` has lapsed and attempts remain, the sweep bumps the
attempt and re-enqueues; if attempts are exhausted, it transitions the
exchange to `state: 'invalid'`, marks the task `'gave-up'`, and appends
a synthetic `pipeline.timeout` `CheckResult` to
`variables.results.default.presentationResults` so the UI can surface
the failure cause.

The practical implication: **clients that stop polling stop driving
recovery**. A wallet that receives `200` and walks away will never
trigger the retry path; the exchange will simply expire under its
existing TTL.

### Caveats

- **Multi-replica.** Each replica owns its own in-memory FIFO worker.
  Two replicas can schedule the same OB pass concurrently for the same
  exchange (e.g. one POST + one sweep landing on different pods);
  `saveExchangeWithCAS` keyed on `attemptId` keeps the persisted state
  coherent — the loser drops its result silently. Duplicate work is
  bounded by `VERIFY_TASK_MAX_ATTEMPTS`.
- **Throughput.** The worker is linear per process. A long OB pass on
  one exchange delays subsequent OB passes on the same replica;
  horizontal scale shifts work to other replicas but does not
  parallelize within one. This is intentional for v1 — it keeps the
  queue trivial to reason about and avoids spawning unbounded fan-out
  under load.
- **Open Badges suite policy.** v1 applies the full `openBadgesSuite`
  unconditionally to every recognized OB credential. The
  `openbadges-suite-resolver.ts` seam is where any future per-exchange
  knob (e.g. opt-in/out of specific OB checks) will land.

### Verification result payload

The verify workflow stores results under
`variables.results.default` using the
[verifier-core 2.x folded result shape](./docs/verification-payload.md):

- `summary[]` — per-(phase, suite) rollup, always populated. Primary
  rendering surface for UIs.
- `results[]` (and `presentationResults[]`) — folded check list,
  carrying only failures and explicitly-emitted skips by default.
  Lazy-expand from `summary[]` for failure detail.
- Pass `variables.options.verbose: true` (CLI: `-v` / `--verbose`)
  to receive every check that ran (passes included).
- Pass `variables.options.timing: true` (CLI: `-t` / `--timing`) to
  receive `TaskTiming` data on every level of the result tree.

See [`docs/verification-payload.md`](./docs/verification-payload.md)
for the full payload contract, examples, and migration notes from
the pre-v2 (`allResults` + per-`CheckResult` `check` / `suite` /
`timestamp`) shape.

### Verify task env knobs

| Key                        | Description                                                                                                                   | Default |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------- |
| `VERIFY_TASK_DEADLINE_MS`  | Per-attempt deadline (ms). Tasks past this are eligible for retry on the next GET-driven sweep.                               | `60000` |
| `VERIFY_TASK_MAX_ATTEMPTS` | Maximum total attempts (initial + retries) before the task is marked `'gave-up'` and the exchange transitions to `'invalid'`. | `2`     |

## Exchange journal

The exchange record stored in Keyv is **evicted** when it expires — `EXCHANGE_TTL` defaults to ten
minutes, and after that `GET` on the exchange 404s and there is nothing left to read. That is
deliberate, and raising the TTL is not the fix: the short window is behaviour callers rely on and
deliberately exercise.

The **exchange journal** is the durable half. When `EXCHANGE_JOURNAL_PATH` is set, the service
appends one line of JSON per exchange-lifecycle event to that file. It has no TTL, is never
truncated or rotated by the service, and is keyed by `exchangeId`.

**What it is for.** This service interoperates with many independent implementations, and no two of
them behave alike. The journal is the developer tool for working with that: it records what actually
happened on the wire, so a developer can see how another implementation behaved, see how ours
behaved, and tell which side a failure belongs to. It records events, not verdicts — a line says
what was served, what arrived and when, and nothing here ranks one implementation against another.

**When `EXCHANGE_JOURNAL_PATH` is unset — the default — the journal is a no-op: no file is opened
or created, and nothing is recorded.**

```jsonc
{
  "ts": "2026-08-11T18:04:22.113Z",
  "exchangeId": "p1-9f2c8b1e-…", // carries exchangeIdPrefix, so a caller's tag is on every line
  "workflowId": "claim",
  "tenantName": "acme",
  "event": "mint",
  "detail": { "expires": "2026-08-11T18:14:22.113Z", "exchangeIdPrefix": "p1" }
}
```

| Event                      | Written when                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mint`                     | An exchange is created, by any of the three workflows.                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `discovery-served`         | An OID4VCI metadata document is served — records which well-known `construction` the client used (`rfc8414-path-suffix` or `oidc-concat`) and which `doc`.                                                                                                                                                                                                                                                                                                                 |
| `interaction-method-shown` | The interaction page reports which payload its QR is carrying. Client-reported: for a by-value OID4VP request nothing reaches our wire, so the page is the only party that knows. `protocolProfileName` is derived from the payload bytes and `protocolProfileSource` says whether the QR named it (`payload`) or the server resolved it (`active`). A payload this service cannot rebuild is journalled in full and marked `recognised: false`.                           |
| `request-served`           | An OID4VP authorization request object is fetched from `.../openid4vp/request`, and by whom. **By-reference arm only**, and the line says so: a by-value request carries every parameter inline, so its absence means _that arm was not in use_, never _the wallet did not fetch_. `protocolProfileName` here is the **elected** profile, with the `delivery`, `queryLanguage` and `requestObjectFormat` beside it read from that same profile.                            |
| `submission`               | A presentation arrives against this exchange, and on which protocol arm. Recorded on arrival, before any verdict, because the outcome events cannot stand in for it — `terminal` is not written when a structural rejection ends the request. A submission with neither a `terminal` nor an `error` line after it is a bug in this service, and a visible one.                                                                                                             |
| `accommodation-served`     | A request is answered on a route that exists only because an accommodation in the [accommodations register](docs/accommodations.md) is served — records which `accommodation`, and the client that took it. Its **absence means no accommodated route was used**, never that the strict route was not taken; and an accommodated route never writes `discovery-served`, so serving a concession does not manufacture the discovery it stands in for.                       |
| `terminal`                 | An exchange is persisted in state `complete` or `invalid`.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `error`                    | A cause was captured that the HTTP response could not carry. `detail.stage` says which: `status-allocate` / `credential-signing` (an upstream refusal, with its status, body and problem details verbatim), `oid4vci-credential-request` (whether a rejected credential request was an _unsupported proof type_ or a _malformed request_ — the wire cannot tell them apart, both being a `400`), or `oid4vp-direct-post` (a wallet's own error response, quoted verbatim). |

Notes on behaviour, all intentional:

- **A journal write can never break an exchange.** Failures (unwritable path, full disk) are logged
  and execution continues. The journal is evidence, not control flow, and no request ever waits on
  a write.
- **Redaction is narrow.** The journal keeps request and response bodies, credential contents and
  error payloads — a record that cannot attribute a failure to a cause is not worth keeping. The
  one hard redaction is `Authorization` bearer tokens, applied centrally so no writer can forget it.
- **The file grows without bound.** Rotation and retention belong to whoever operates the
  deployment; the service will not truncate its own durable record.

See [`docs/adr/2026-08-11-exchange-journal-durable-record.md`](docs/adr/2026-08-11-exchange-journal-durable-record.md),
and [`docs/adr/2026-08-26-accommodated-routes-record-themselves.md`](docs/adr/2026-08-26-accommodated-routes-record-themselves.md)
for why an accommodated route records itself and never the strict-path event it stands in for.

## did:web document hosting

When a tenant issues under a `did:web` identifier, that DID only resolves if a document is served at
the identifier's own URL. The authority in `did:web:<host>:<path…>` is the **host**, and for a
path-form identifier the document lives inside this service's UI path:

```
did:web:example.com:ui:example-tenant  →  https://example.com/ui/example-tenant/did.json
```

This service serves that path by **proxying** `dcc-signing-service`'s
`GET /instance/:instanceId/did.json`, which derives the document from the same seed and URL that
produce the signature. It does not keep a copy — not in the repo, not in an env var. A copy is a
hand-maintained duplicate of a derived value, and we shipped one once: the published document and
the configured seed drifted apart, so the issuer identifier and the signing key disagreed, and it
went unnoticed for an entire milestone because nothing compared them. Proxying makes that
disagreement unrepresentable rather than merely unlikely.

**No new configuration.** Both halves are already in `TENANT_ISSUER_<n>_*`: the `id` gives the
request path, and `SIGNING_TENANT` names the signing-service tenant whose seed derives it. Hosting
therefore follows from issuing being configured, and there is no third place for the tenant segment
to be written down differently.

Behaviour worth knowing:

- **The route is registered ahead of the `/ui/*` static mount** in `src/hono.ts`, and must stay
  there. `pnpm dev` runs `vite build` with `emptyOutDir: true`, which deletes anything hand-placed
  under `dist/ui` — so a `did.json` file in the built output survives exactly until the next build
  and then the issuer's DID silently stops resolving. A route cannot be wiped by a build. There is a
  regression test for this in `src/did-web.app.test.ts`.
- Every other path under `/ui/` still falls through to the static mount untouched.
- Documents are cached in memory for 60 seconds. The document is a pure function of a fixed seed and
  URL, so it cannot change within a run. Failures are never cached.
- **A signing-service failure is a `502`**, with a message naming the DID, the URL that was tried and
  the environment variables to check. It is not a `500`: this service is healthy and its upstream is
  not.
- A `did.json` under `/ui/` for a tenant that is not configured is a plain `404`. Nothing is invented.

The served document is a plain DID document, no envelope. Note the shape `@interop/did-web-resolver`
produces on the signing side: the key is embedded under `assertionMethod`, and there is **no**
top-level `verificationMethod` array — read `assertionMethod[0].publicKeyMultibase`.

Configure the signing service side with `TENANT_DIDMETHOD_<TENANT>=web`, `TENANT_DID_URL_<TENANT>`
and `TENANT_CRYPTOSUITE_<TENANT>`; see that repo's README. `ecdsa-rdfc-2019` is refused with did:web
and stays refused.

See [`docs/adr/2026-08-11-did-web-document-by-proxy.md`](docs/adr/2026-08-11-did-web-document-by-proxy.md).

## Health Check

Docker has a [HEALTHCHECK](https://docs.docker.com/reference/dockerfile/#healthcheck) option for
monitoring the state (health) of a container. We've included an endpoint `GET /healthz` that checks
the health of the data storage backend. The endpoint can be directly
specified in a CURL or WGET call on the HEALTHCHECK, but we also provide a
[healthcheck.js](./healthcheck.js) function that can be similarly invoked by the HEALTHCHECK and
which itself hits the `healthz` endpoint, but additionally provides options for both email and Slack
notifications when the service is unhealthy.

You can see how we've configured the HEALTHCHECK in our [example compose
files](https://github.com/digitalcredentials/docs/blob/main/deployment-guide/DCCDeploymentGuide.md#docker-compose-examples).
Our compose files also include an example of how to use
[autoheal](https://github.com/willfarrell/docker-autoheal) together with HEALTHCHECK to restart an
unhealthy container.

If you want notifications sent to a Slack channel, you'll have to set up a Slack [web
hook](https://api.slack.com/messaging/webhooks).

If you want notifications sent to an email address, you'll need an SMTP server to which you can send
emails, so something like Sendgrid, Mailchimp, Mailgun, or even your own email account if it allows
direct SMTP sends. Gmail can apparently be configured to so so.

### `GET /health/ready` — readiness, which is a different question

`/healthz` above is **liveness**: it writes a Keyv record, sleeps `4 × keyvWriteDelayMs` and reads
it back. It mutates state, it is deliberately slow, and it is wired to a load balancer's target
group. It is unchanged and must not be repurposed.

`GET /health/ready` answers _can this service run an exchange right now_ — signing service
reachable, status service reachable and tokened, tenants resolvable, journal writable if
configured, and every `did:web` document this service publishes resolvable **and naming the
identifier it is published under**. It touches nothing: no mint, no signature, no status
allocation, so it is safe to poll mid-exchange.

**It returns a per-dependency breakdown, never a bare boolean.** A fault in this service presents
as a generic success just as readily as a generic 500, and `{"ready": false}` reproduces exactly
that problem — it says an exchange cannot start and not which of five services to go and look at.
The top-level `ready` flag exists only to choose 200 versus 503; the array is the answer.

```bash
curl -s localhost:4004/health/ready | jq '.dependencies[] | [.name, .status] | @tsv'
```

Each dependency reports `ok`, `unready`, or **`skipped`**. `skipped` means this deployment is not
configured for that dependency at all — an unset `STATUS_SERVICE` is a legitimate deployment, so it
cannot be `unready`; it is emphatically not `ok` either, because nothing was checked. Whether a
`skipped` row is _acceptable_ is a judgement only the caller can make — a deployment that requires
every credential it issues to carry a `credentialStatus` should treat a skipped status service as a
failure. That rule belongs in whatever gates that deployment, not in this route, where it would be
wrong for every other one. Readiness reports the shape of the deployment; the caller decides whether
that shape is good enough for what it is about to do.

## Environment Variables

There is a sample .env file provided called .env.example to help you get started with your own .env
file. The supported fields:

| Key                        | Description                                                                                                                                                                                                                  | Default               | Required |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | -------- |
| `PORT`                     | HTTP port on which to run the express app                                                                                                                                                                                    | 4004                  | no       |
| `DEFAULT_EXCHANGE_HOST`    | Default exchange host to use when constructing the exchange endpoints                                                                                                                                                        | http://localhost:4004 | no       |
| `EXCHANGE_TTL`             | Time to live for exchanges in seconds                                                                                                                                                                                        | 600 (10 minutes)      | no       |
| `EXCHANGE_JOURNAL_PATH`    | File path for the append-only exchange journal (JSONL). Unset disables it entirely — see [Exchange journal](#exchange-journal). A debugging tool — it has no rotation or TTL, so it would overload a production environment. | none (no-op)          | no       |
| `STATUS_SERVICE`           | URL for the status service. Set to empty string to disable                                                                                                                                                                   | http://localhost:4008 | no       |
| `STATUS_SERVICE_TOKEN`     | Bearer token for the status service, which authenticates every write                                                                                                                                                         | none                  | no       |
| `SIGNING_SERVICE`          | URL for the signing service                                                                                                                                                                                                  | http://localhost:4006 | no       |
| `DEFAULT_WORKFLOW`         | Default workflow type to use                                                                                                                                                                                                 | didAuth               | no       |
| `DEFAULT_TENANT_NAME`      | Default tenant name when no tenants are configured                                                                                                                                                                           | default               | no       |
| `PERSIST_TO_FILE`          | Full local file path to a Keyv data storage file. Priority over `REDIS_URI`                                                                                                                                                  | no                    | no       |
| `REDIS_URI`                | Redis URI for storing exchange data. Use this or `PERSIST_TO_FILE`                                                                                                                                                           | no                    | no       |
| `KEYV_WRITE_DELAY`         | Delay in milliseconds between writing to keyv and checking for expiration                                                                                                                                                    | 100                   | no       |
| `KEYV_EXPIRED_CHECK_DELAY` | Delay in milliseconds between checking for expired exchanges                                                                                                                                                                 | 14400000 (4 hours)    | no       |
| `DEFAULT_PROTOCOL_PROFILE` | Protocol profile served when neither the exchange nor its tenant names one — see [Protocol profiles](./docs/protocol-profiles.md). Unset means no layer names one, and resolution throws rather than guessing                | none                  | no       |

### Tenant Configuration

For multi-tenant setups, you can configure tenants using the following pattern:

| Key Pattern                    | Description                                                                                                                                                   | Example                                                     | Required |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------- |
| `TENANT_TOKEN_<tenant_name>`   | Bearer token for the specified tenant                                                                                                                         | `TENANT_TOKEN_acme=abc123`                                  | no       |
| `TENANT_ORIGIN_<tenant_name>`  | Origin domain for the specified tenant                                                                                                                        | `TENANT_ORIGIN_acme=https://acme.com`                       | no       |
| `TENANT_PROFILE_<TENANT_NAME>` | [Protocol profile](./docs/protocol-profiles.md) for this tenant's exchanges, when the exchange names none of its own. Suffix uppercased, as `TENANT_ISSUER_*` | `TENANT_PROFILE_ACME=oid4vp-1.0-by-value-dcql-redirect-uri` | no       |

#### Issuer instances

A tenant may declare one or more issuance lines, numbered from 1 and read until the first gap. Each
names the issuer DID, the cryptosuite and the signing-service tenant that holds the seed.

| Key Pattern                                      | Description                                          | Example                                                            | Default           |
| ------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------------------ | ----------------- |
| `TENANT_ISSUER_<n>_ID_<TENANT_NAME>`             | Issuer DID for this line. Ends the scan when absent. | `TENANT_ISSUER_1_ID_EXAMPLE=did:web:example.com:ui:example-tenant` | —                 |
| `TENANT_ISSUER_<n>_CRYPTOSUITE_<TENANT_NAME>`    | Cryptosuite to sign with                             | `TENANT_ISSUER_1_CRYPTOSUITE_EXAMPLE=eddsa-rdfc-2022`              | `eddsa-rdfc-2022` |
| `TENANT_ISSUER_<n>_SIGNING_TENANT_<TENANT_NAME>` | Signing-service tenant holding the seed              | `TENANT_ISSUER_1_SIGNING_TENANT_EXAMPLE=example-tenant`            | the tenant name   |

An instance whose `ID` is a `did:web:` identifier also drives
[did:web document hosting](#didweb-document-hosting) — no extra configuration.

An instance selects the issuance line and the signing tenant; it does **not** stamp
`credential.issuer`. Issuer identity belongs to the signing service, which derives it from that
tenant's seed and sets `.id` on an object issuer rather than replacing the object. Writing the
instance `id` into the credential here would not change the resulting identity, and would flatten an
issuer Profile — its `name`, `url` and `description`, which is the metadata a wallet displays — into
a bare string.

### Health Check Configuration

Health check may be configured to send emails or post to a webhook when the service is unhealthy.
See [Health Check](#health-check) for more details.

| Key                            | Description                                                                                 | Default                    | Required |
| ------------------------------ | ------------------------------------------------------------------------------------------- | -------------------------- | -------- |
| `HEALTH_CHECK_SMTP_HOST`       | SMTP host for unhealthy notification emails - see [Health Check](#health-check)             | no                         | no       |
| `HEALTH_CHECK_SMTP_USER`       | SMTP user for unhealthy notification emails - see [Health Check](#health-check)             | no                         | no       |
| `HEALTH_CHECK_SMTP_PASS`       | SMTP password for unhealthy notification emails - see [Health Check](#health-check)         | no                         | no       |
| `HEALTH_CHECK_EMAIL_FROM`      | Name of email sender for unhealthy notifications emails - see [Health Check](#health-check) | no                         | no       |
| `HEALTH_CHECK_EMAIL_RECIPIENT` | Recipient when unhealthy - see [Health Check](#health-check)                                | no                         | no       |
| `HEALTH_CHECK_EMAIL_SUBJECT`   | Email subject when unhealthy - see [Health Check](#health-check)                            | no                         | no       |
| `HEALTH_CHECK_WEB_HOOK`        | Posted to when unhealthy - see [Health Check](#health-check)                                | no                         | no       |
| `HEALTH_CHECK_SERVICE_URL`     | Local URL for this service - see [Health Check](#health-check)                              | http://SIGNER:4004/healthz | no       |
| `HEALTH_CHECK_SERVICE_NAME`    | Service name to use in error messages - see [Health Check](#health-check)                   | SIGNING-SERVICE            | no       |

## Versioning

The transaction-service is primarily intended to run as a docker image within a docker compose
network, typically as part of a flow that is orchestrated by the [DCC Issuer
Coordinator](https://github.com/digitalcredentials/issuer-coordinator) and the [DCC Workflow
Coordinator](https://github.com/digitalcredentials/workflow-coordinator). Set the
`DEFAULT_EXCHANGE_HOST` to the url of the outer reverse proxy that will be used to route requests to
the transaction-service. You don't have to expose this service to the public internet if there is a
proxy in front of it inside the docker compose network or VPC.

For convenience DCC has published the images for the transaction-service and the other services used
by the coordinators, as well as for the coordinators themselves, to Docker Hub so that you don't
have to build them locally yourself from the GitHub repositories.

The images on Docker Hub will of course at times be updated to add new functionality and fix bugs.
Rather than overwrite the default (`latest`) version on Docker Hub for each update, we've adopted
the [Semantic Versioning Guidelines](https://semver.org) with our docker image tags.

We DO NOT provide a `latest` tag so you must provide a tag name (i.e, the version number) for the
images in your docker compose file.

To ensure you've got compatible versions of the services and the coordinator, the `major` number for
each should match. At the time of writing, the versions for each are at 0.1.0, and the `major`
number (the leftmost number) agrees across all three.

If you do ever want to work from the source code in the repository and build your own images, we've
tagged the commits in GitHub that were used to build the corresponding Docker image. So a GitHub tag
of v0.1.0 corresponds to a docker image tag of 0.1.0

## Development

To install locally (for development):

```
git clone https://github.com/digitalcredentials/transaction-manager-service.git
cd transaction-manager-service
npm install
npm run dev
```

## Contribute

PRs accepted.

If editing the Readme, please conform to the
[standard-readme](https://github.com/RichardLitt/standard-readme) specification.

## License

[MIT License](LICENSE.md) © 2022 Digital Credentials Consortium.
