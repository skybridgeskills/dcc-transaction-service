# An interop fixture reproduces a shape; it does not carry a captured artifact

- Status: **Accepted.**
- Date: 2026-09-11
- Workflow: all (`claim`, `didAuth`, `verify`)

## Context

This service is an interoperability surface: most of what it has to keep working
is _the shape another implementation's bytes arrive in_. A signed credential
with the proof laid out one way, a presentation authenticated by a holder key of
a particular DID method, a metadata document with a field in an unusual place.

There are two ways to pin such a shape in a test.

- **Capture it.** Take the bytes a real product actually produced and commit
  them.
- **Manufacture it.** Write a generator that mints bytes of the same shape from
  keys and identifiers this repo controls.

A capture feels stronger, and the argument for it is real: nobody wrote it to
pass, so it cannot have been shaped by the assumptions of the code under test.
That argument is what this decision has to answer, because it is otherwise
persuasive enough to keep winning.

⚠️ **This repository is public.**

## Decision

**An interop test fixture in this repo reproduces an observed shape. It does not
carry captured artifacts from third-party products.**

`src/test-fixtures/make-acceptance-fixtures.ts` is the worked example: it issues
a credential under a locally derived P-256 key, publishes that key in a
`did:web` document on a documentation-reserved domain, derives an
`ecdsa-sd-2023` selective-disclosure proof from it, and wraps the result in a
presentation authenticated by a `did:jwk` holder. The two files it writes are
what `src/lib/verifier-acceptance.test.ts` verifies.

### 1. The regression value lives entirely in the shape

What the acceptance test asserts is structural: the credential proof is
`ecdsa-sd-2023` and verifies; it carries no `created`; the presentation's
`verificationMethod` is a `did:jwk:` URL; the derivation is real, so withheld
fields are genuinely absent. Every one of those is a property of the
construction. **None of them is a property of who produced it.**

So a manufactured fixture covers exactly what a captured one covers, and the
gates fail against the pre-fix source either way.

### 2. Provenance is the only part that cannot be published

A capture is not just the shape. It also carries, unavoidably and often
invisibly: the issuing party's DID and host names, status-list URLs that resolve
to somebody's live infrastructure, exchange identifiers, holder key material,
and whatever ended up in the credential subject.

⚠️ **That payload is the one part of a capture with no test value at all**, and
it is the part that a public repository publishes permanently. It is also the
part nobody can un-publish later: a fixture is committed once and read forever.
Committing a capture therefore trades no additional coverage for a disclosure
that cannot be withdrawn.

This is the same rule
[the `did:web` proxy ADR](2026-08-11-did-web-document-by-proxy.md) states for
configuration — no customer identifier hardcoded in source — applied to test
data, where it is easier to violate by accident.

### 3. A generator, committed beside what it writes

The generator is checked in, run by hand, and its output committed:

```
npx tsx src/test-fixtures/make-acceptance-fixtures.ts
```

⚠️ **The output is not reproducible byte-for-byte** — `ecdsa-sd-2023` signs each
non-mandatory statement with a freshly generated key and blinds blank-node
labels with a fresh HMAC key, so no two runs agree. The committed file is the
artifact; the generator is the record of how it was made, and it is the thing to
read when the shape needs to change.

That is also why the generator is not run at test time. A fixture minted on
every run pins nothing: the bytes under test would move whenever the generating
libraries did, which is the failure a fixture exists to catch.

### 4. Every identifier is simulated, on a reserved domain

`issuer.example.com`, `verifier.example.com`, and keys generated in the
generator's own process. `example.com` resolves for nobody, which is what makes
the fixture hermetic as well as anonymous: the only network-shaped dependency is
the issuer's `did:web` document, and the test stubs it. Both the generator and
the test throw on any other document load, so a new remote dependency becomes a
failure rather than a silent fetch.

## Consequences

- **A fixture cannot be evidence about a named product**, and must not be cited
  as one. It is evidence about a construction. Where a claim about a particular
  implementation is wanted, the journal is what carries it.

- ⚠️ **A shape has to be understood before it can be reproduced.** This is the
  real cost, and it is mostly a benefit: writing the generator forces somebody
  to work out _which_ properties of the observed bytes matter, and that
  understanding lands in the generator's docblock where a captured blob would
  have carried it implicitly and unread.

- **Changing what a fixture covers means editing a program**, not hand-patching
  JSON. Hand-editing a signed fixture invalidates its proof, so the generator is
  the only maintenance path — which is the point.

- **A genuinely irreproducible shape is a signal, not an exception.** If some
  construction cannot be manufactured, that usually means it depends on a
  behaviour nobody has characterised yet. Characterise it. Reaching for a
  capture at that moment records the mystery instead of solving it.

## Alternatives considered

- **Commit the capture, redact the identifiers.** Rejected. Redacting a signed
  document breaks its proof, so the fixture stops verifying and stops testing
  the thing it was kept for. Redacting only the unsigned parts leaves the signed
  ones — issuer DID, key ids, often a status-list URL — which is most of what
  was sensitive.

- **Commit the capture, keep it out of the public tree.** Rejected: a test that
  cannot run in a clone of this repository is a test that does not run. It also
  moves the disclosure question rather than answering it.

- **Generate at test time instead of committing the output.** Rejected in §3:
  the bytes would move with the generating libraries, so the fixture would stop
  pinning anything.

- **Trust that a capture is unremarkable.** Rejected as unenforceable. Whether a
  particular credential carries something sensitive is a judgement made once, by
  whoever commits it, about a document they may not have read to the end — and
  the cost of getting it wrong is a permanent public record.
