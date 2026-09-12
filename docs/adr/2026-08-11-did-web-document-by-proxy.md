# Publish the `did:web` document by proxying its key holder, never by copy

- Status: Accepted
- Date: 2026-08-11
- Services: `dcc-transaction-service` (hosting), `dcc-signing-service` (derivation)

## Context

One of our issuer instances is identified by a path-form `did:web`:

```
did:web:example.com:ui:example-tenant
```

Two facts about that identifier are not up for negotiation. The **authority is
the host**, so whatever answers on that host is what a wallet or
verifier resolves the DID from — and that is this service, not the signing
service, which is internal. And the **identifier itself is fixed**: credentials
already issued under it name it as their issuer, so re-identifying the issuer
would break every credential that cites the old one.

Meanwhile the *key* lives in `dcc-signing-service`, derived from a per-tenant
seed and `TENANT_DID_URL_<TENANT>`. So the bytes a resolver needs are computed
in one process and must be served from another.

There is prior damage here. **Gap H1** was a hand-maintained `did.json`: the
published document said one thing, the configured seed produced another, the
issuer identifier and the signing key disagreed, and nothing in the system ever
compared them. It survived an entire status-service milestone undetected,
because a wrong DID document does not fail loudly — it fails at a relying
party, later, as an unverifiable credential with no obvious cause.

## Decision

**The transaction service serves the DID document by proxying the signing
service, which derives it. Nothing anywhere keeps a copy.**

1. `dcc-signing-service` gains `GET /instance/:instanceId/did.json`. It calls
   the same `didWebDriver.generate({ seed, url })` on the same `DID_SEEDS`
   entry that the signing path uses, and returns `did.didDocument` verbatim.
   Unauthenticated — a DID document is public by definition and carries only
   public key material. `404` for a `did:key` tenant, which has nothing to host.
   The one shared did:web driver in that service is now a single instance, so
   even a driver-configuration difference cannot separate the two paths.

2. `dcc-transaction-service` intercepts the DID's own path, fetches from that
   endpoint, and returns the document unchanged, through a 60-second in-memory
   cache. Failures are never cached.

3. **Both halves are derived from configuration that already exists.** The path
   comes from an issuer instance's `id`; the signing tenant to ask comes from
   its `signingServiceTenant`. No new environment variables in either service,
   and in particular **no campaign or customer identifier hardcoded in source**.
   ⚠️ That rule holds for test data too: a fixture reproduces the shape it is
   testing under simulated identifiers on a documentation-reserved domain,
   rather than carrying a captured one —
   [ADR 2026-09-11](2026-09-11-manufactured-interop-fixtures.md).

4. **The route is registered ahead of the `/ui/*` static mount** in
   `src/hono.ts`, with the constraint commented at the call site and pinned by
   a regression test that plants a decoy `did.json` on disk at exactly that
   path and asserts the route wins.

5. **A signing-service failure is a `502`**, with a message naming the DID, the
   URL tried, and the environment variables to check.

## Consequences

- **Drift is unrepresentable, not merely unlikely.** The published document
  *is* the signing key's document. There is no second copy to fall out of date,
  and no code path that could produce one. Gap H1 cannot recur in this shape.
- **A did:web resolution now depends on the signing service being reachable.**
  This is the real price and it is paid knowingly. A static file would resolve
  while signing is down and this does not. We accept it
  because the failure it replaces is worse in kind: an unreachable document
  fails immediately and visibly, at the resolver, with a 502 that names its own
  cause, whereas a stale document verifies wrongly and silently, somewhere
  else, much later. **Availability is recoverable; a wrong answer that looks
  right is not.**
- **Do not "fix" the coupling by adding a fallback cache-to-disk.** That
  reintroduces the copy, and it reintroduces it in its most dangerous form —
  one that is only consulted when the derivation is unavailable to contradict
  it. If availability becomes a genuine constraint, the answer is to make the
  signing service reachable, not to keep a second version of the truth.
- **Route ordering became load-bearing.** A path-form `did:web` lands inside
  `/ui/*`, which is a static mount over `./dist/`, and `pnpm dev` runs
  `vite build` with `emptyOutDir: true`. Anything hand-placed there is deleted
  by the next build. Moving the route after the static mount would not fail any
  build or type check; it would just stop resolving. Hence the comment and the
  test.
- **Bare-domain `did:web` is not hosted.** `/.well-known/did.json` needs a
  route outside `/ui/*` and a decision about what else claims that host's
  `.well-known`. The identifier in use is path-form; nothing needs it yet.
- **The served document becomes checkable against what it claims to be.**
  `/health/ready` fetches it and compares the *served* document's `id` to the
  identifier it is published under — gap H1 — and the comparison means something
  precisely because the two come from one derivation rather than two sources
  that happen to agree. Pinned by `src/lib/readiness.test.ts`.

## Alternatives considered

- **A repo-tracked `did.json` plus a route.** Rejected twice over. It is a
  file-based configuration surface in a service configured entirely by
  environment variables, so it deploys poorly; and it is a hand-maintained copy
  of a derived value, which is gap H1 restated.
- **A `TENANT_DID_DOCUMENT_<TENANT>` environment variable.** Deploys fine, and
  is the same copy with the same drift — now also unreadable in a diff, so the
  disagreement that burned us would be even harder to spot.
- **Serving the document from the signing service directly.** Not available:
  the authority is the host in the identifier, the tunnelled host is this
  service, and the identifier cannot change.
- **Deriving the document in the transaction service.** Rejected: it would need
  the tenant's private seed, duplicating the one secret this system is careful
  to keep in a single service, in order to avoid one HTTP call.
- **Caching hard, or falling back to the last good document on failure.**
  Rejected — see the consequences above. A stale document is exactly the
  failure mode this decision exists to remove.
