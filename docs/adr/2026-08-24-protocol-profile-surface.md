# The protocol profile surface: named, total, flat, and owned by this service

- Status: Accepted
- Date: 2026-08-24
- Workflow: all (`claim`, `didAuth`, `verify`)

## Context

This service's product goal is to be **one transaction service that speaks to an
overlap of different wallets** — secure, and able to communicate over many
protocols and many profiles of those protocols. The clients it talks to agree on
almost nothing: which query language an OID4VP request may carry, whether a
request object may be fetched, how a DID method is spelled in a presentation
request, which grant a credential offer may advertise.

The obvious way to absorb each of those disagreements is **a new per-exchange
knob**, declared in `schema.ts` and again in a workflow schema, independently
settable. Eleven of them accumulated that way.

That has three costs, and the third is the one that decides this.

1. **The combinations are not enumerable.** Eleven independent flags is 2048
   possible wire behaviours, of which a handful are ever emitted.
2. **What was sent cannot be cited.** "By-reference DCQL with, we think,
   `vprLimitDisclosure` unset" is not a reproducible statement, and everything
   this service claims about its own wire behaviour rests on being able to name
   the construction it emitted.
3. ⚠️ **Two deployments can disagree while both reporting the truth.** Any knob
   with a default means the bytes depend on what each deployment's default
   happens to be. Nothing in a report distinguishes "we chose this" from "this
   is what our build happened to do".

Each new wire behaviour arrives as a twelfth knob, and makes all three worse.

## Decision

Replace per-exchange protocol flags with **named, versioned, total protocol
profiles**, defined and owned by this service.

### 1. Totality — a profile states every field that changes the bytes

The dividing line is one question: **does it change what the wallet sees on the
wire?** Yes → a profile field, fully specified. No (host, TTL, storage, log
level) → server config, and a profile never touches it.

⚠️ **A missing wire field is a loud validation error, never a silent
fallback.** Enforced in three places, of which the first is the guarantee:

- `assertSchemaIsTotal` walks the profile schema **at module load** and throws
  on any `.optional()` or `.default()`. It runs at import rather than in a test
  because a rule only a test enforces ships broken the first time somebody skips
  the tests. A `.default()` is refused alongside `.optional()`: it is the same
  failure wearing a friendlier face.
- Zod's own required-field parse refuses an incomplete definition, and
  `parseProtocolProfile` renders that refusal as a sentence naming the field and
  saying that no default is coming.
- The registry builds **at module load**, so a deployment whose profiles do not
  parse fails to start rather than serving bytes it cannot name.

**Absence is stated, never omitted**: `'none'`, `false`, `[]`, or a `null`
section. `undefined` and `[]` are not the same thing — a lesson this repo has
already paid for once, in `resolveTrustedRegistries`.

**Cost accepted knowingly:** profiles are verbose, and every new wire field must
be added to every profile. That cost is the mechanism, not a side effect of it.

### 1b. Bad combinations are refused, in two named classes

⚠️ **Totality is necessary and not sufficient.** A profile can state every field
correctly and still describe something the service will not do — and in an
option-rich surface that is most of the ways to be wrong. Two cases parse
cleanly on the schema alone:

- `queryLanguage: 'dcql'` with `limitDisclosure: 'required'` — `limit_disclosure`
  is a DIF Presentation Exchange constraint with no DCQL equivalent, so the ask
  is **dropped and nothing is emitted**. A profile like that reports a client's
  behaviour under an ask it never received.
- `responseMode: 'direct_post.jwt'` — nothing reads the field, so `direct_post`
  goes out in silence.

Both are one defect: **a profile that says one thing while the wire says
another**, which makes the name a lie — and the name is the entire product of
this surface.

The rules live in one place, in two lists kept deliberately apart:

- **Contradictions** — wrong regardless of what anybody builds (spec-forbidden,
  or internally meaningless). Permanent.
- **Unbuilt arms** — coherent, buildable, not built. Each **pins a field to the
  value the code actually emits**.

⚠️ **The pins are what make an unread field safe.** 17 of 26 profile fields are
stated but not yet read by any builder; pinned, each can only hold the value the
hardcode produces, so stating it is truthful rather than decorative.

⚠️ **`UNBUILT_ARMS` is consequently the work list**, and building an arm means
deleting its entry in the same change that wires the field — unavoidably,
because the schema refuses the value until the entry goes. That coupling makes
"wired the field" and "allowed the value" impossible to do separately, which is
exactly how a field comes to be stated and unread.

Rejected: **one list**. Merging them loses the distinction a reader needs when
deciding what to build next, and invites the tempting fix of reclassifying a
work item as a permanent law to make a failure stop.

Rejected: **warning instead of refusing.** A warning on a wire-affecting
mismatch is a silent fallback with extra steps.

### 2. Flat identity, with version and client_id prefix in the name

`oid4vp-1.0-jwt-unsigned-by-reference-redirect-uri`, not
`oid4vp-1.0-jwt-by-reference` with a prefix modifier. Nothing inherits from a
"version base". The specification itself corroborates the shape — VCALM's keys
are `oid4vci-1.0` and `oid4vp-1.0`, version in the identity rather than a
modifier on a generic name.

⚠️ **The client_id prefix segment is in every name**, including the names that
have no second prefix to be distinguished from. Adding the segment only when a
second prefix appears would mean renaming every profile, every test card and
every existing citation of a name — the exact churn that putting version in the
identity avoids.

### 3. Exactly one profile active per exchange; no layering

Three layers may name a profile — the exchange, its tenant, the app default —
and the most specific layer that names one **wins outright**. A layer naming
nothing is skipped.

⚠️ **Two named profiles are never merged.** A merged result still has a name; it
just is not a name that describes the bytes, which makes every citation of it
wrong in a way nobody can see.

"Merged onto base system defaults" is realised as: the app default is the last
layer, and there is nothing left to merge once it is reached, **because a stored
profile is total**. A base layer supplying *parts* of a profile would be a
partial profile by another name.

Naming nothing anywhere **throws**. A deployment that has not said which profile
it serves cannot have its bytes attributed to a name.

### 4. Keyed by workflow, because the wire genuinely differs by workflow

⚠️ Two VPR fields differ between `didAuth` and `verify` in production today:
`interact.service` carries three entries for one and two for the other, and
`domain` is the bare exchange host for one and the full per-exchange service
endpoint for the other. A flat VPR section would have to pick one and break the
other's bytes.

So a profile states the wire **per workflow**. This is nesting, not inheritance:
nothing resolves at request time, and the workflow selects a branch that was
already written out in full.

The alternative — one profile per workflow, named per workflow — was rejected
because `DEFAULT_PROTOCOL_PROFILE` would then be unable to serve a deployment
running more than one workflow, which every deployment does.

### 5. Composition at authoring time, never at request time

Profiles multiply — protocol × version × option set × client_id prefix — and
share content. A generator or shared fragments **may** produce them. What is
stored, served and cited is always the fully-resolved total definition. **DRY
authoring; the wire never sees a merge.**

### 6. Definitions live here; the test suite references names

Profile definitions are this service's own versioned data. The interoperability
test suite **references profile names** and asserts the emitted profile against
its own card; it does not define what a profile emits.

⚠️ If the definitions lived in the test suite, what a deployment emits would
depend on which version of that suite it happened to have — the same
cross-deployment divergence decisions 1 and 3 exist to prevent, arriving through
a dependency instead of through config. This repo has been bitten by that exact
shape before: code here depended on endpoints a later commit in that repo
deleted.

Directionally: this service is the **product**, that suite is the **tests**, and
a product's wire behaviour must not be defined by its tests. Drift is caught
*because* the two are separately owned — one asserts what the other emits.

### 7. Named for the construction, never for a vendor

`oid4vp-1.0-by-value-dcql-redirect-uri`, never `<vendor>-profile`. Mechanised:
a name carrying a wallet product name is refused at parse time, with the shipped
wallet names **derived** from the wallet registry rather than retyped.

Four reasons, and the third is the product one:

- A construction-named profile **stays true**; a vendor-named one becomes a lie
  on that vendor's next release.
- A profile named for a vendor is a standing claim about that vendor, shipped in
  code they do not control.
- ⚠️ **Multiple wallets share constructions, and that overlap IS the product
  goal.** Vendor names hide precisely the thing the service exists to find.
- The product → profile lookup table is separate **because it is the part that
  should go stale**: cheap to fix, obviously wrong when wrong, and a place a
  vendor or the community can send a correction without gaining any say over
  what this service emits.

`lcw` survives as a legacy protocol key in the envelope. Legacy protocol keys
are kept, not renamed; that is a different question from what a profile may be
called.

## Consequences

- **Every new wire field must be added to every profile.** Stated plainly
  because it is the real cost, and it is load-bearing. The moment one field is
  allowed to be optional, two deployments can disagree while both citing the
  same name.

- **Profiles are long.** A profile states three workflows' envelopes and VPRs
  even when it is named for one OID4VP construction. Authoring-time composition
  is the sanctioned answer; a shorter type is not.

- **Authoring a profile is separate work from defining the surface.** A profile
  that reproduces an existing construction has to be checked byte-for-byte
  against what this service actually emits, and that is not a review anybody
  can do at the same time as reviewing a type.

- ⚠️ **`variables.protocolProfileName` is accepted and retained on the exchange
  record**, where Zod would otherwise strip it. It is an input surface: a
  caller can name the profile an exchange is served under.

- **A profile name is a public identifier.** It appears in test cards, in
  documentation, and in anything that cites what this service emitted. Renaming
  one breaks every existing reference to it, which is why the prefix segment is
  in the name from the start.

- ⚠️ **The pins fire on work that has not read this ADR.** Adding an envelope
  spelling or a new arm hits a refusal by design. That is the mechanism
  working, not an obstacle: the refusal is what forces the wiring and the
  permission to land together.

- **`missingWireFields` is not a second enforcement mechanism**, and the code
  says so. It exists for asking the question away from parsing, and for the
  message. A reader who mistook it for the guarantee would weaken the schema
  believing it was covered.

- **Config resolution can now fail at startup-shaped points.** A deployment that
  sets `DEFAULT_PROTOCOL_PROFILE` to an unregistered name gets a throw naming
  the registered profiles, rather than a service that serves something else.

## Alternatives considered

- **Layered profile inheritance** (a base profile plus overrides). Rejected: two
  profiles simultaneously active means the bytes are a function of a merge,
  which is a function of what each layer happened to be at that moment. Two
  deployments both truthfully reporting the same tenant and profile then emit
  different bytes — the failure named profiles exist to end.

- **A "version base" layer** that `oid4vp-1.0-*` profiles inherit from.
  Rejected: it is a profile by another name, and reintroduces the merge above.
  Version belongs *in* the identity.

- **Request-time composition** (assembling a profile from fragments per
  request). Rejected for the same reason, plus the worse one: the composed
  result would never exist anywhere a reader could look at it.

- **Definitions owned by the interoperability test suite.** Rejected — see
  decision 6. It would make emitted bytes a function of a dependency version,
  and it collapses the separation that lets one side catch the other's drift.

- **Vendor-named profiles.** Rejected — see decision 7.

- **One profile per protocol family, resolved per exchange from a set.**
  Rejected: it requires each config layer to name a *set* of profiles and
  resolution to match a family against a workflow, which is more machinery for
  the same guarantee, and it puts a second selection step between the name and
  the bytes.

- **Keeping the eleven knobs and documenting the combinations.** Rejected: a
  document is not a mechanism, and the document would describe 2048 behaviours
  of which it could only ever have checked a handful.
