# Transaction Service Changelog

## Unreleased

This release puts a **named protocol surface** on the VC-API exchange service
and adds two OpenID protocol bindings on top of it, together with the durable
record and the developer tooling needed to work with wallets that implement
those protocols differently.

### Protocol profiles

- **A protocol profile is a named, versioned, _total_ statement of every
  byte-affecting choice this service makes when it talks to a wallet.**
  `src/protocol-profiles/` holds the registry; `docs/protocol-profiles.md`
  describes it. A profile is stored fully resolved — there is no inheritance,
  no merging and no composition at request time — and a definition missing any
  wire field is refused at load, so a deployment whose profiles do not parse
  never starts.
- **Ten registered profiles**, each reproducing a construction this service
  emits: six OID4VP constructions across the delivery, query-language and
  `limit_disclosure` axes, the conformant signed request-object arm, and three
  Verifiable Presentation Request arms that each omit one field this service
  emits.
- **Resolution is exactly-one-wins**, never merged: the exchange's
  `variables.protocolProfileName`, else the tenant's `TENANT_PROFILE_<TENANT>`,
  else the app-wide `DEFAULT_PROTOCOL_PROFILE`. An explicitly set per-exchange
  knob still beats the profile, so an in-flight exchange emits what it always
  did.
- **Combination checks beside the totality check.** Totality catches a field an
  author forgot; coherence catches a field filled in with a value that cannot
  work. Two classes, kept apart: **contradictions**, wrong no matter what
  anybody builds (a `redirect_uri` client_id beside a signed request object,
  `request_uri_method` on the by-value arm, `limit_disclosure` asked for in
  DCQL, which parses and emits nothing at all), and **unbuilt arms**, coherent
  but with no code behind them. Every unbuilt-arm entry pins its field to the
  value the code actually emits, so building an arm means deleting its pin in
  the same change that wires the field.
- **A profile is named for its construction and never for a product.**
  `assertProfileNameIsNotVendorNamed` fires at parse time, and the token list it
  checks against is derived from the wallet product table rather than
  hand-maintained — a hand-maintained roster goes stale the first time a product
  is renamed, and a stale guard reads as complete when it is not.
- **Render-time election.** A fetched URL may carry `?protocolProfile=<name>` —
  on `request_uri` and on the interaction URL — and the bytes served for that
  one request are built under that registered profile. ⚠️ **Nothing is
  persisted**: the elected name lives on a request-scoped copy of the exchange,
  so a wallet that failed can be retried under a different construction without
  minting a new exchange. ⚠️ **Selection, not composition** — the parameter
  names a stored, total profile and can never carry a definition or a field
  override. Refused, never half-honoured: an unregistered name and a by-value
  profile are `400`; an exchange carrying an explicit knob, an exchange that
  named its own `protocolProfileName`, and a profile differing on a
  response-bound axis (`delivery`, `queryLanguage`, `clientIdPrefix`) are `409`
  naming the cause.
- **Two environment variables**, `DEFAULT_PROTOCOL_PROFILE` and
  `TENANT_PROFILE_<TENANT_NAME>`, and one CLI flag, `--protocol-profile <name>`,
  which reaches every registered profile.
- **The emitted bytes are pinned.** `src/test-fixtures/protocol-goldens/` runs
  the whole matrix twice — once with no profile configured, once profile-driven
  with every per-exchange knob stripped — and both reproduce the same bytes.

See [`docs/protocol-profiles.md`](./docs/protocol-profiles.md),
[ADR 2026-08-24](./docs/adr/2026-08-24-protocol-profile-surface.md) and
[ADR 2026-08-25](./docs/adr/2026-08-25-render-time-protocol-profile-election.md).

### OID4VP 1.0 verifier binding

For `verify` exchanges the service serves the **verifier** side of OpenID for
Verifiable Presentations 1.0, so a wallet can present a Data Integrity
credential over OID4VP. The presented VP runs through the same `verifier-core`
pipeline as the VC-API path.

- `GET /workflows/verify/exchanges/:exchangeId/openid4vp/request` — the
  authorization request, lazily minting a single-use `state`.
- `POST /workflows/verify/exchanges/:exchangeId/openid4vp/response` —
  `direct_post` `vp_token`, bound to the exchange by `state`, `nonce` and
  `client_id`↔`domain`.
- **Both query languages, selected per exchange.** DCQL is the default;
  DIF Presentation Exchange is served on request, and a profile may serve both
  in one request object. Speaking both lets the same question be asked twice, so
  a client that honours `type` while ignoring `format` is catchable — and the
  choice is made on the exchange, never by sniffing the payload.
- **Both delivery arms** — every parameter inline in the deep link, or a
  `request_uri` the wallet fetches.
- **Two request-object envelopes.** Raw JSON under the `redirect_uri` client-id
  prefix is the default. The other is a **conformant signed request object**:
  `application/oauth-authz-req+jwt` with a real signature, a `typ` of
  `oauth-authz-req+jwt`, and a `kid` resolved from the entity's published DID
  document, under the `decentralized_identifier` prefix. §5.9.3 says an
  implementation requiring signed requests cannot use the `redirect_uri` prefix,
  so this arm does not.
  - The JWS comes from **`dcc-signing-service`**, the only component that
    derives both the published document and the signing key from one seed, and
    its bytes are served **verbatim**.
  - The `client_id` is the tenant's **entity identity**
    (`TENANT_ISSUER_1_ID_<TENANT>` — not a role identity; a verifier-only
    organisation uses the same identifier).
  - ⚠️ **A signing failure is a named `502` and never an unsigned response.**
    There is no fallback on any path, and the upstream's own 4xx is not
    forwarded to the wallet.
  - ⚠️ **Conformant is not the same as accepted.** The signature is EdDSA and
    cannot be anything else — the `did:web` driver cannot express a P-256
    verification method — where ES256 is the mDL/EUDI default. Selectable only;
    conformance is not by itself a reason to move the default.
  - ⚠️ **A tenant whose entity identity is a `did:key`, or which declares none,
    cannot serve this arm** and is refused **at mint** with a named error: a
    `did:key` publishes no document for a wallet to resolve the `kid` from.
- **There is no unsigned-JWT arm, and there must not be one.** §5.10.1 requires
  the `request_uri` response to be a signed request object in every published
  version, and `alg: none` is an OIDC Core §6.1 affordance that RFC 9101 (JAR)
  deliberately removed — OID4VP inherits JAR. The lineage is written down in
  `src/oid4vp/request-object-jwt.ts` because it keeps being re-derived.
- **The set this verifier advertises accepting is exactly the set it will
  verify.** `ecdsa-sd-2023` stays a registered verifying suite: verifiable when
  presented, never advertised, and not invitable.

See [`docs/oid4vp-1.0-verifier.md`](./docs/oid4vp-1.0-verifier.md),
[ADR 2026-07-11](./docs/adr/2026-07-11-oid4vp-1.0-verifier-binding.md),
[ADR 2026-08-25](./docs/adr/2026-08-25-oid4vp-request-object-envelopes.md) and
[ADR 2026-09-10](./docs/adr/2026-09-10-advertised-acceptance-equals-actual.md).

### OID4VCI 1.0 pre-authorized code flow

For `claim` exchanges the service serves the OpenID for Verifiable Credential
Issuance 1.0 Pre-Authorized Code Flow. The wallet-facing entry point is an
`openid-credential-offer://?credential_offer_uri=…` deep link.

- Credential Offer, Credential Issuer Metadata, per-exchange OAuth
  Authorization Server Metadata, the pre-authorized code grant at
  `…/openid/token`, a single-use `c_nonce` at `…/openid/nonce`, and issuance at
  `…/openid/credential` against a `proofs.di_vp` Data Integrity key proof bound
  to that nonce.
- **Both metadata constructions are served** — the RFC 8414 path-suffix form
  and the OIDC-Discovery concatenated form — because a per-exchange
  `credential_issuer` always carries a path, so the two differ for every
  exchange and clients disagree about which to use. An
  `…/.well-known/openid-configuration` alias returns the same AS metadata; it is
  **not** a conformant OIDC OP metadata document.
- **`discoveryElections` on the exchange record.** Because both constructions
  are served, which one the client chose no longer shows up in the outcome — so
  it is recorded: the construction/document pairs actually served, in the order
  they were first fetched. A client that fetched both and a client that fetched
  one are different facts.

See [`docs/oid4vci-pre-authorized-flow.md`](./docs/oid4vci-pre-authorized-flow.md).

### The protocol envelope and the interaction page

- **Versioned VCALM spellings.** `oid4vp-1.0` and `oid4vci-1.0` are emitted
  alongside the unversioned `OID4VP` / `OID4VCI` and carry byte-identical
  values. VCALM retains the unversioned names indefinitely, so nothing is
  renamed. Which keys appear is profile-driven, and `getProtocols` returns
  `App.ExchangeProtocols`.
  ⚠️ **`interact` is deliberately not emitted.** In VCALM it is a delegation
  mechanism for redirecting a wallet to a _different_ interaction URL, not a
  name for our own; emitting it would land a wallet back here.
- **`GET /interactions/:exchangeId`** is content-negotiated: the SPA shell for a
  browser, the protocols envelope for a wallet. It accepts
  `?protocolProfile=<name>`.
- **`GET /interactions/:exchangeId/presets`** returns the launch presets the
  page may offer — server-built payloads, a generic axis diff against the
  exchange's active profile, and product ids. Computed per request, never
  persisted, and on its own route because a wallet reads the envelope at
  `GET /interactions/:exchangeId`. Facts only: labels and variant words are copy
  and live in the UI.
- **`POST /interactions/:exchangeId/method`** is the page reporting which
  payload its QR is showing. Write-only, `204`, unauthenticated.
- **`interactionMethodElections` on the exchange record**, so the interaction
  method a page displayed survives record eviction and is visible to a caller
  polling `GET`. A set in first-election order; repeats are not appended.
  ⚠️ The construction is derived from the **payload bytes**, with
  `source: 'payload' | 'active'` separating _the QR named it_ from _the server
  resolved it_. ⚠️ The journal takes every reported interaction method; the
  record takes only payloads this service can rebuild for an offerable preset,
  and an unrecognised one is journalled **as unrecognised**.
- **The interaction page is a preset picker** — one list, one search box, one
  `Include advanced options` checkbox. Search **promotes** rather than filters,
  and the operator decode block (candidate letter, `payloadId`, delivery,
  `client_id`, elected construction) sits beside the QR under the same checkbox.
  ⚠️ **A QR that disagrees with the highlighted preset is a refusal, not a
  caption**, and the check is asymmetric so a _dropped_ pin is caught as well as
  a wrong one. `?payload=` and `?protocolProfile=` both work in the URL, and
  selecting the active construction writes no `protocolProfile` at all.
- **The interaction URL is itself an option**, rendered as a QR code, as
  selectable text and behind a **Copy link** button, so scanning it moves the
  session to a phone. Where the clipboard is unreachable (insecure origins), the
  button says so and points at the visible URL text.

### Exchange journal

The exchange record is evicted when `EXCHANGE_TTL` lapses — ten minutes by
default — and the short window is behaviour callers depend on. The **exchange
journal** is the durable half: one line of JSON per exchange-lifecycle event,
appended to `EXCHANGE_JOURNAL_PATH`, keyed by `exchangeId`, with no TTL and no
rotation.

- **What it is for.** This service interoperates with many independent
  implementations, and no two of them behave alike. The journal is the developer
  tool for working with that: it records what actually happened on the wire, so
  a developer can see how another implementation behaved, see how ours behaved,
  and tell which side a failure belongs to. It records events, not verdicts, and
  it ranks nobody.
- **A closed event set** — `mint`, `discovery-served`,
  `interaction-method-shown`, `request-served`, `submission`,
  `accommodation-served`, `terminal`, `error` — because an open `event: string`
  would make the record unreadable by anything that has not read every writer.
- **Opt-in and inert by default.** With `EXCHANGE_JOURNAL_PATH` unset, no file
  is opened or created and nothing is recorded.
- **A journal write can never break an exchange.** Failures are logged and
  execution continues; no request ever waits on a write. Lines are chained so
  they land in append order, and `ts` is stamped when the fact happened rather
  than when the filesystem got round to it.
- **Redaction is narrow.** Request and response bodies, credential contents and
  error payloads are kept — a record that cannot attribute a failure to a cause
  is not worth keeping. The one hard redaction is `Authorization` bearer tokens,
  applied centrally so no writer can forget it.
- **The file grows without bound.** Rotation and retention belong to whoever
  operates the deployment.

See [ADR 2026-08-11](./docs/adr/2026-08-11-exchange-journal-durable-record.md).

### Accommodations

An **accommodation** is a construction this service serves _in addition to_ the
strict one, because a client that exists cannot complete the exchange against
the strict construction alone.
[`docs/accommodations.md`](./docs/accommodations.md) is the register: what is
served, whether a published spec sanctions it, and what it costs to read a
result gathered on the accommodated route. It is prose — nothing loads it at
runtime — and it keeps entries for accommodations this service **declines** to
serve, because the reasoning is what the next person to meet the same client
behaviour needs.

- **The strict alternative stays live** for every accommodation served, and the
  tests pin that.
- **An accommodated route records itself, never the strict event it stands in
  for.** The journal writes `accommodation-served` and _not_ the
  `discovery-served` line the strict route would have written, so serving a
  concession never manufactures the behaviour it substitutes for.

See [ADR 2026-08-26](./docs/adr/2026-08-26-accommodated-routes-record-themselves.md).

### Wallet product table

- **`src/lib/wallets/` is pure data** — id, display name, search aliases, an
  ordered list of construction/base pairs, and an optional
  `protocolProfileName`. The URL shapes live in `link-constructions.ts`, named
  for the shape and never for a product, and which shape the service emits is a
  profile field. A product absent from the table, or carrying no profile, falls
  back to the service default; absence is never an error.
- **`searchWallets` / `walletMatchScore`** rank candidates — exact, then prefix,
  then substring, then description — so typing part of a name finds the product.
  ⚠️ `findWalletByName` stays an exact lookup beside it: _not in the table_ and
  _you have not finished typing_ must not look the same on screen.

### did:web document hosting

A `did:web` identifier only resolves if a document is served at its own URL. For
a path-form identifier that URL lives inside this service's UI path, and this
service serves it by **proxying** `dcc-signing-service`'s
`GET /instance/:instanceId/did.json` — the component that derives the document
from the same seed and URL that produce the signature. It keeps no copy: a copy
is a hand-maintained duplicate of a derived value, and the published document
and the configured seed drift apart silently.

- **No new configuration.** Both halves are already in `TENANT_ISSUER_<n>_*`.
- The route is registered **ahead of the `/ui/*` static mount** and must stay
  there — a file placed in the built output is deleted by the next build,
  whereas a route cannot be. There is a regression test for it.
- Documents are cached in memory for 60 seconds; failures are never cached.
- A signing-service failure is a **`502`** naming the DID, the URL tried and the
  environment variables to check — not a `500`, because this service is healthy
  and its upstream is not. An unconfigured tenant is a plain `404`.

See [ADR 2026-08-11](./docs/adr/2026-08-11-did-web-document-by-proxy.md).

### Readiness

**`GET /health/ready`** answers _can this service run an exchange right now_ —
signing service reachable, status service reachable and tokened, tenants
resolvable, journal writable if configured, and every `did:web` document this
service publishes resolvable **and naming the identifier it is published
under**. It touches nothing — no mint, no signature, no status allocation — so
it is safe to poll mid-exchange. `GET /healthz` is unchanged and remains the
liveness probe.

**It returns a per-dependency breakdown, never a bare boolean.** Each dependency
reports `ok`, `unready`, or **`skipped`**; `skipped` means the deployment is not
configured for that dependency at all, which is neither a failure nor an `ok`.
Whether a `skipped` row is acceptable is a judgement only the caller can make.

### Exchange ids

**`exchangeIdPrefix`** is an optional caller-supplied component of the minted
`exchangeId`, sent as a sibling of `variables` because it instructs the id
minter rather than the exchange. The service then mints
`<exchangeIdPrefix>-<uuid>`, and the value appears in the interaction URL and QR
code, every discovery URL, all `:exchangeId` routes and every journal line — so
correlating an exchange with a caller's own concept never requires reading this
service's store, which matters because that store is evicted. Validated
`^[A-Za-z0-9_-]{1,32}$`, and **visible to the counterparty**.

See [ADR 2026-08-11](./docs/adr/2026-08-11-exchange-id-prefix.md).

### Verification pipeline

- **verifier-core 2.x result shape.** The verify workflow consumes the folded
  result (`summary: SuiteSummary[]` plus `results: CheckResult[]` carrying only
  failures and explicit skips by default). `summary` is a first-class required
  field on `App.VerificationResult` and
  `App.CredentialVerificationResult`, and the UI renders primarily from it,
  lazy-expanding into `results[]` for failure detail.
- **`App.CheckResult.id` is required** and namespaced as
  `<phase>.<suite>.<localPart>` (or `compat.<fix-name>`), which is the canonical
  key for filtering and grouping on the consumer side. `compatLog` carries the
  synthetic compatibility-fix entries; verifier-core's own results come through
  the standard `presentationResults` / `credentialResults` shape.
- **`variables.options.verbose`** returns every check that ran, passes included;
  **`variables.options.timing`** populates `TaskTiming` at every level of the
  result tree and mounts the UI's timing panel. Both are exposed on the CLI as
  `-v` / `--verbose` and `-t` / `--timing`.
- **Asynchronous Open Badges pass.** The verify workflow splits into a
  synchronous default-suites pass and an asynchronous Open Badges pass driven by
  an in-process FIFO worker. `POST` returns `200` once the sync pass commits and
  the exchange stays `active` until the worker commits, so **a consumer must
  re-check `state` on the exchange `GET` before granting any privilege**.
- **GET-driven sweep.** There is no scheduled sweep: a `GET` against a verify
  exchange retries a lapsed attempt up to `VERIFY_TASK_MAX_ATTEMPTS`, and an
  exhausted task is marked `gave-up`, moves the exchange to `invalid` and
  appends a synthetic `pipeline.timeout` check. A client that stops polling
  stops driving recovery.
- **Optimistic CAS on exchange writes** (`saveExchangeWithCAS`, keyed on
  `verifyTask.attemptId`) so a stale worker cannot overwrite a sweep-bumped
  attempt, and a **process-wide shared `Verifier`** so issuer DID, status list
  and JSON-LD context caches are shared across both passes.
- **New environment knobs:** `VERIFY_TASK_DEADLINE_MS` (default `60000`) and
  `VERIFY_TASK_MAX_ATTEMPTS` (default `2`).

See [`docs/verification-payload.md`](./docs/verification-payload.md).

### Test fixtures

**Signed interoperability fixtures reproduce a shape rather than carrying a
captured artifact.** They are generated against a simulated issuer under
identifiers this repository owns, and their value is the shape a verifier has to
accept, which a generated fixture carries in full. See
[ADR 2026-09-11](./docs/adr/2026-09-11-manufactured-interop-fixtures.md).

### Deprecated

- **Three per-exchange protocol knobs** — `oid4vpQueryLanguage`,
  `oid4vpDelivery`, `vprLimitDisclosure` — are superseded by protocol profile
  fields. ⚠️ **Retired, not removed:** each still works, still beats a profile
  that came from the tenant or the app default, and names its replacement in its
  JSDoc. ⚠️ Naming a profile and setting a knob it supersedes on the same
  request is a `400` naming both — one caller cannot say two things about one
  wire field.
- Deliberately not migrated: `vprContext` / `vprCredentialType` / `vprClaims`
  (per-exchange request content, not construction), `tamper` (a
  deliberate-corruption arm), and `trustedIssuers` / `trustedRegistries`
  (verification controls that reach no emitted byte).

## 0.3.0 - 2024-11-25

### Changed

- added test coverage
- added health check option

## 0.2.0 - 2024-10-11

### Changed

- updated libs to support VC2

## 0.1.1 - 2023-12-11

### Changed

- added optional metadata property on stored object

## 0.1.0 - 2023-09-26

### Added

- Initial commit.
- First working MVP commit.
