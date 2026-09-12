# The advertised acceptance equals the actual acceptance

- Status: **Accepted.**
- Date: 2026-09-10
- Workflow: `verify`

## Context

`client_metadata.vp_formats_supported.{ldp_vc,ldp_vp}.cryptosuite_values` is
what this verifier tells a wallet it accepts. A conformant wallet reads it
before deciding whether to **derive** a selective-disclosure proof, so a name in
that list is a promise the wallet acts on and **has no way to check**. It is one
of the few places in the exchange where the counterparty is obliged to take this
service at its word.

That makes the list attractive for a purpose it must not be used for: naming a
suite the verifier would refuse, in order to provoke a client into producing a
proof that could be captured off the wire upstream of the refusal. It works, and
it works by lying.

## Decision

**The set of cryptosuites this verifier advertises is exactly the set it will
verify. Nothing widens it per exchange, per profile, or per request.**

The advertised set is `src/lib/verifiable-cryptosuites.ts`. There is no knob, no
profile field and no request parameter that adds to it.

### 1. A false statement on the wire is the thing being forbidden

Advertising acceptance of a suite we would refuse is a lie told to a party that
cannot check it, in the one place a wallet is *supposed* to be able to trust.
That such a claim can produce a useful capture does not change what it is: the
capture is bought by misrepresenting our own capability, and any result read off
it is a result about a client responding to a false premise.

### 2. ⚠️ There is no narrower honest form of this capability

The obvious middle path — a field that widens the advertised set but forbids
suites we cannot verify — is the empty set, and this is worth working through
before anybody proposes it again. Anything already in the advertised list is
already advertised, so such a field could only ever name a suite that is
**verifiable but deliberately unadvertised**. Today that is `ecdsa-sd-2023` and
nothing else. One value, and its meaning is *invite derivation* — which is a
different feature with a different name, and needs its own decision (below).

### 3. ⚠️ `ecdsa-sd-2023` is a verifying suite that is not advertised

**Verifiable, never advertised, un-invitable.** That is the accurate end state,
and the comment at the registration in `src/lib/verifier-crypto-suites.ts` says
exactly that.

Do not "tidy" the registration away on the grounds that nothing asks for the
suite. ⚠️ **A wallet may derive unprompted**, and refusing a proof we can
actually check would be a gap of ours reported as a client's defect — the
failure `verifier-crypto-suites.ts` exists to end. The asymmetry here is a
statement about what we advertise, never about what we can do.

### 4. The capability is absent, not disabled

There is no field to set, no flag to flip and no value to leave at a safe
default. ⚠️ **A capability that can be switched back on is a capability this
deployment still has**, and the point is that the service cannot make the claim
at all. A flag would also put the decision on whoever is running an exchange at
the time, which is the worst possible moment to re-litigate it.

`variables` strips unknown keys, so a caller still sending a field from an older
schema is served the default construction's bytes exactly.

## Consequences

- **One construction, one golden.** A golden pinning a widened advertised set
  would pin bytes `verify-default.json` already pins — the same construction
  asserted twice under two names, which is how a reader concludes there are two.

- ⚠️ **An unregistered profile name gets a `400` naming the registered
  profiles**, rather than silently getting something else. That refusal is the
  intended behaviour: a caller citing a construction this service does not serve
  should find out, not be quietly served the default.

- ⚠️ **`OID4VP_AXIS_SCOPE` is type-enforced total**, so `Oid4vpProfileFields` and
  the classification table cannot drift apart. A comment stands where an
  advertised-set axis would go, because the next author to want this capability
  should find the reasoning before the gap.

- **The surviving assertion is stronger and narrower than a per-construction
  one:** the advertised list deep-equals the capability constant *and never
  contains `ecdsa-sd-2023`* — true on every exchange under every profile, not
  only on the default.

- ⚠️ **Every remaining registered profile differs from the default on a
  mint-bound axis** (`delivery`, `queryLanguage`, `clientIdPrefix`) or changes
  only the VPR, so render-time election is exercised through the interaction URL
  alone. The mechanism is unchanged; it has nothing to demonstrate on the OID4VP
  interaction method until a profile varies a request-scoped OID4VP axis. The
  tests that have no vehicle say so at the site.

## Alternatives considered

- **A field that widens the advertised set but forbids unverifiable suites.**
  Rejected in §2: the honest version is the empty set.

- **The capability, disabled behind a flag.** Rejected in §4: disabled is not
  absent.

- **Two goldens for one construction.** Rejected: two fixture names pinning one
  set of bytes is how a reader concludes there are two constructions.

## When an honest version could exist

If observing derivation behaviour is genuinely worth building for, the thing to
build is **an invitation, named as one** — a profile field that says *offer
selective disclosure*, backed by suites this verifier actually accepts, with
`ecdsa-sd-2023` moved **into** the advertised set rather than smuggled past it.
That is a different feature: it makes a true statement, it is reproducible from
the profile name, and a wallet that takes it up gets a proof we will check.

⚠️ It still costs a separate arm, because advertising derivation on every
exchange changes what every exchange observes — the same variant argument
`token-endpoint-inline` records in
[the accommodations register](../accommodations.md).
