# Protocol profiles

A **protocol profile** is a named, versioned, **total** statement of every
byte-affecting choice this service makes when it talks to a wallet.

This is the reference to read before adding or changing one. The reasoning
behind the shape is in
[the ADR](adr/2026-08-24-protocol-profile-surface.md); this document is the
working reference for an author.

> ⚠️ **"Profile" means three different things around this codebase.**
>
> | where | what it means |
> |---|---|
> | `src/protocol-profiles/` (here) | a **`ProtocolProfile`** — a statement of what we put on the wire |
> | `src/cli/profiles/` | a preset of exchange **variables** for the CLI |
> | the LER interoperability test suite | a **conformance profile** a wallet is measured against |
>
> The type, its fields and its functions are qualified for exactly this reason:
> `ProtocolProfile`, `protocolProfileName`, `resolveProtocolProfile`,
> `PROTOCOL_PROFILES`. **Never introduce a bare `Profile` here.**

## Why the surface exists

This service talks to wallets that agree on almost nothing. Every disagreement
was absorbed as a per-exchange knob — eleven of them, each declared twice, each
independently settable, which is 2<sup>11</sup> possible wire behaviours of
which a handful have ever been observed. Reproducing a result meant reproducing
a combination of flags nobody wrote down.

A profile replaces that with a **combination stated in one place, cited by
name, and reproducible**. "We ran
`oid4vp-1.0-json-by-reference-dcql-redirect-uri`" is an answer. "We ran with
`oid4vpDelivery: by-reference` and `oid4vpQueryLanguage: dcql` and, we think,
`vprLimitDisclosure` unset" is not.

## The one rule: totality

> **A profile states every field that changes the bytes a wallet receives.
> There are no defaults and no fallbacks.**

The dividing line is one question, asked of every field:

**Does it change what the wallet sees on the wire?**

- **Yes** → a profile field, fully specified.
- **No** (host, TTL, storage backend, log level) → server config, and a profile
  never touches it.

A profile missing a wire field is refused, loudly, naming the field. Silent
fill-in is the failure mode, not a convenience: it is exactly how two
deployments of this service come to emit different bytes while both truthfully
reporting the same profile name.

**Cost accepted, knowingly:** profiles are verbose, and every new wire field
must be added to every profile. **That cost is the mechanism.**

### Stated absence, never omission

A construction that is not emitted says so with a value:

| meaning | how it is written |
|---|---|
| this parameter is not emitted | `'none'`, or `false` |
| this list is empty on the wire | `[]` |
| this workflow offers no such construction | `null` at the section |

`undefined` and `[]` are not the same thing, and an omitted field is not an
answer. An omitted field means *the author forgot*; a stated absence means
*the author decided*.

### What enforces it

| mechanism | what it catches | when it runs |
|---|---|---|
| `assertSchemaIsTotal` | any `.optional()` or `.default()` in the schema | **module load** — a bad schema crashes the process |
| Zod's required-field parse | a profile that does not state a field | every `parseProtocolProfile` |
| `parseProtocolProfile`'s message | turns the above into a sentence naming the field and saying no fallback is coming | on failure |
| `assertProfileNameIsNotVendorNamed` | a vendor product name in a profile name | parse, and directly |
| `coherenceProblems` | a field stated with a value that **cannot work** — see below | parse |
| the registry build | a duplicate name, or a definition that skipped the parser | **module load** |

`missingWireFields` is available for asking the question away from parsing. It
is **not** the refusal mechanism — see the note in `schema.ts` before relying
on it as one.

## Rejecting bad combinations

Totality catches a field an author forgot. It does not catch a field an author
filled in with a value that **cannot work** — and OID4VP and OID4VCI are
option-rich enough that most of their field combinations are not constructions
at all.

Two that parsed cleanly before `coherence.ts` existed:

- **`queryLanguage: 'dcql'` with `limitDisclosure: 'required'`.** ⚠️ **This one
  emitted nothing.** `limit_disclosure` is a DIF Presentation Exchange
  constraint; DCQL has no equivalent, so the selective-disclosure ask was
  dropped and the request went out asking for everything. An exchange run on
  that profile would have reported a wallet's behaviour under an ask it never
  received.
- **`responseMode: 'direct_post.jwt'`.** Nothing reads the field. The service
  emitted `direct_post` and said nothing about it.

Both are the same defect: **a profile that says one thing while the wire says
another.** The name is then a lie, and the name is the entire product of this
surface.

### The two classes, and why they are kept apart

**Contradictions** — wrong no matter what anybody builds. A `redirect_uri`
client_id with a signed request object is forbidden by OID4VP §5.9.3;
`request_uri_method` on an arm with no `request_uri` describes a fetch that
cannot happen. **Permanent.**

**Unbuilt arms** — coherent, buildable, not built. `direct_post.jwt` is a real
response mode; we do not serve it. Every entry **pins a field to the value the
code actually emits**.

⚠️ **Never move an entry between the two lists to make a failure go away.** They
mean different things to a reader deciding what to build next.

### Why the pins matter more than they look

A large minority of the profile fields are **stated but not yet read** by any
builder — 17 of 26 when the pattern was introduced, fewer with each arm that
lands. The pins are what make that safe: an unread field can only hold the value
the hardcode already emits, so stating it is truthful rather than decorative.

⚠️ **`UNBUILT_ARMS` is therefore the work list** — the inventory of everything
this surface has room for and no code behind. Building an arm means **deleting
its entry in the same change that wires the field**, and you cannot avoid doing
so: until the entry goes, the schema refuses the value the new arm needs.

That coupling is the whole design. It makes "wired the field" and "allowed the
value" impossible to do separately, which is how a field ends up stated and
unread in the first place.

**To build an arm:**

1. Wire the field at its read site.
2. Delete or narrow its entry in `UNBUILT_ARMS`.
3. Add any pairing check the new value makes reachable, **and check whether
   lifting the pin has made a PERMANENT wrong combination writable.** If it has,
   that is a new `CONTRADICTIONS` entry — not a moved one. Both JWT arms did
   this:
   - the unsigned arm lifted the format pin and made
     `jwt-request-object-by-value` writable — a Request Object JWT passed by
     value is the `request` parameter, a different construction from the inline
     parameters this service emits;
   - the signed arm lifted the `declared-true` pin and made
     `require-signed-contradicts-an-unsigned-envelope` writable — declaring the
     verifier requires signed requests while serving an unsigned one at the very
     next fetch.
4. Add a golden for the construction. ⚠️ A construction that did not exist
   before has no pre-change capture to check against, so say so in its `why`;
   the wire tests are its acceptance and the fixture is regression protection
   from then on.
5. ⚠️ **Assert the positive case too.** A rule that refuses everything is
   indistinguishable from a rule that refuses the wrong thing, so a lifted pin
   needs a test that the combination it unblocked now *parses*.

## The wallet product table

⚠️ **Three separate things, deliberately kept apart:**

| thing | where | example |
|---|---|---|
| the **shape** of a link | `src/lib/wallets/link-constructions.ts` | `vc-request-url-query` |
| **which shape** we emit | a protocol profile field | `envelope.walletConvenienceConstruction` |
| **who a product is and where its links point** | `src/lib/wallets/*.ts` | `learncard`, `https://learncard.app/request` |

Before this split, one vendor-named object held all three — *who this product
is* and *what bytes we build for it*, in one file per vendor.

**What that hid:** three of the four products build the **same URL shape** and
differ only in their own address. Three functions, three files, one shape nobody
could see — and multiple wallets sharing a construction is precisely the overlap
this service exists to find.

⚠️ A shape named for a vendor also **becomes a lie on that vendor's next
release**, and releases are frequent. And a vendor-named profile shipped in our
product is a standing claim about a vendor, made in code they do not control.

### The table is expected to go stale, and that is the design

A vendor renames an app, ships a new scheme, or changes which profile it works
with, and this table is wrong until somebody fixes it. That is a good trade:
cheap to fix, obviously wrong when wrong, and — the part that matters — ⚠️ **a
pull request against the table cannot change what the service emits.** That is
what makes it safe to take a correction from a vendor or the community without
giving anyone a say over the wire.

### Adding an entry

```ts
export const someWallet: Wallet = {
  id: 'some-wallet',
  name: 'Some Wallet',
  aliases: ['SomeWallet', 'SW'],          // matched for search-by-app-name
  links: [{ construction: 'vc-request-url-query', base: 'sw://request' }],
  protocolProfileName: 'oid4vp-1.0-…'     // optional
}
```

- `links` is **ordered pairs, not a base plus a list of shapes.** ⚠️ One product's
  two shapes point at two different *paths* on one host (`/request` and
  `/request.html`); a single base would build one of them wrong, silently.
- `base` is **product identity** — a vendor's own address — not construction.
- ⚠️ **`protocolProfileName` is optional and absence is never an error.** A
  product without one, or absent from the table entirely, falls back to the
  service default. That is the normal path, not a degraded one; guessing on a
  product's behalf is how a stale table starts changing bytes.
- ⚠️ **Two products may name one profile.** That is not a duplication to tidy —
  it is the overlap being measured, and vendor-named profiles would make it
  unsayable.

### The one product whose link the service emits

`lcw`, under the grandfathered `lcw` protocols key — not a VCALM protocol, kept
because callers already read it. Every other product's link is built by the
interaction page when a user picks it. ⚠️ The page does **not** rebuild the
server-provided link: a second place a wire-affecting value is decided would
disagree with the first the moment a profile changed the shape.

## Naming

Flat, lowercase, hyphen-separated segments. Version **and** client_id prefix are
part of the identity:

```
oid4vp-1.0-json-by-reference-dcql-redirect-uri
oid4vp-1.0-by-value-dcql-redirect-uri
oid4vp-1.0-jwt-signed-by-reference-decentralized-identifier
oid4vci-1.0-pre-authorized-code
```

- ⚠️ **No `/`, `+` or `:`.** A separator invites a hierarchy, and a hierarchy is
  inheritance with better manners.
- ⚠️ **Version is in the name, not above it.** Nothing inherits from a "version
  base"; a version layer is a profile by another name.
- ⚠️ **The client_id prefix segment is in the name from the start**, before
  there is a second prefix to distinguish. Adding it later means renaming every
  profile, every test card and every citation of a result.
- ⚠️ **Never a vendor product name.** A construction-named profile stays true; a
  vendor-named one becomes a lie on that vendor's next release, and products are
  renamed, re-branded and re-attributed faster than a profile registry can
  follow. Vendor names also hide the thing worth finding: several wallets
  share one construction, and that overlap is the point. Product → profile
  mapping is a **separate lookup table**, deliberately: it is the part that
  *should* go stale, cheap to fix, obviously wrong when wrong, and a place a
  vendor can send a correction without gaining any say over what this service
  emits.

`lcw` remains a key in the protocols envelope. That is a grandfathered legacy
protocol key, not a licence to name a profile after a wallet.

## Shape

```ts
ProtocolProfile {
  name
  description
  workflows: { claim, didAuth, verify }   // each a total WorkflowWireProfile
}

WorkflowWireProfile {
  envelope    // which protocols-object keys each construction lands in
  vpr         // the Verifiable Presentation Request we emit
  oid4vp      // the OID4VP authorization request, or null
  oid4vci     // the OID4VCI credential offer, or null
  issuance    // media type and envelope of the issued credential, or null
}
```

### Why it is keyed by workflow

⚠️ **Because the VPR this service emits is not the same for every workflow**,
and both differences are on the wire today:

| | `didAuth` | `verify` |
|---|---|---|
| `interact.service` | three entries, including `CredentialHandlerService` | two entries |
| `domain` | the bare exchange host | the full per-exchange service endpoint |

A single flat VPR section would have to pick one and break the other's bytes.
Naming a profile per workflow instead would leave `DEFAULT_PROTOCOL_PROFILE`
unable to serve a deployment that runs more than one workflow — which every
deployment does.

This is **nesting, not inheritance**. Nothing resolves at request time and
nothing merges; the workflow selects a branch that was already written out in
full at authoring time.

### A field is a construction, not a literal

⚠️ `client_id` is not a string in a profile. It is `redirect_uri:` plus the
exchange's response URI, or `decentralized_identifier:` plus the entity DID. The
profile says **which construction**; the exchange supplies the identity it is
parameterized by.

The same split runs through the whole type: **a profile states HOW, the exchange
states WHAT.** Credential types, contexts and claims are exchange data and
appear nowhere in a profile.

## Resolution

```ts
resolveProtocolProfile({ exchange, tenant, config })
```

Three layers may name a profile. **The most specific layer that names one wins
outright**; a layer that names nothing is skipped.

| layer | where it is set |
|---|---|
| exchange | `variables.protocolProfileName` on the create request |
| tenant | `TENANT_PROFILE_<NAME>` (suffix uppercased, as `TENANT_ISSUER_*`) |
| app default | `DEFAULT_PROTOCOL_PROFILE` |

⚠️ **Two named profiles are never merged.** If you find yourself merging two,
the design has gone wrong. A merged result still has a name — it just is not a
name that describes the bytes, which makes every citation of it wrong in a way
nobody can see.

"Merged onto base system defaults" means the app default is the **last layer**,
and there is nothing left to merge once it is reached, because a stored profile
is total. The base is a whole profile that loses to any layer naming one, not a
set of fill-ins that survive underneath one.

⚠️ **Naming nothing anywhere throws.** A deployment that has not said which
profile it serves cannot have its bytes attributed to a name, and a service that
guesses produces records nobody can reproduce.

`resolveProtocolProfileName` returns the winning name **and its source layer**,
so an election can be recorded: "the tenant default" and "the exchange asked for
what the tenant default happens to be" are different events, and only one of
them changes when the tenant default changes.

## Render-time selection

A wallet failed. The exchange is live, its `state` unconsumed, and the operator
wants to try a different construction **without minting a new exchange** — a
fresh QR and a fresh scan cost another round trip through the operator and the
wallet.

So a **fetched URL** may carry the construction it should be served under:

| URL | with an election |
|---|---|
| `request_uri` | `…/openid4vp/request?protocolProfile=<name>` |
| the interaction URL (`iu`) | `…/interactions/<id>?iuv=1&protocolProfile=<name>` |

⚠️ **`?payload=` is unchanged and orthogonal.** It names the envelope key;
`?protocolProfile=` names the construction. A *preset* in the interaction page is
a UI grouping over the two — **not a third parameter** — and every card citing
`?payload=OID4VP` keeps working exactly as it did.

⚠️ **The pin rides on the URL that is FETCHED, and no further.** On the OID4VP
arm it therefore sits one level in, inside `request_uri`, because
`routes.oid4vpRequest` reads the profile at fetch time — a deep link pinned only
on the outside would advertise a `request_uri` that serves the default. And a
`request_uri` inside a pinned interaction envelope carries **no** pin, so it
serves this exchange's own construction: that is what its own absence of a pin
says, and copying the pin down would make the parameter mean "and everything
reachable from here".

### Selection, not composition

⚠️ **This does not break "composition at authoring time, never at request
time."** An election **picks one stored, total, already-validated definition** and
serves it whole; nothing is merged, and every byte is still attributable to
exactly one registered name. The line to hold is that **an election may only ever
name a registered profile** — the moment a parameter can carry a definition, a
fragment, or a single-field override, the rule is broken for real. See
`docs/adr/2026-08-25-render-time-protocol-profile-election.md`.

### Elections are observation-only, and the mechanism is where the value lives

The elected profile reaches the resolvers as a **request-scoped shallow copy** of
the exchange carrying `variables.protocolProfileName`, so every resolver honours
it with no signature change — including ones not yet written. The copy exists for
one request and `saveExchange` is never called with it. Nothing about the
exchange changes.

⚠️ **The copy drops the stamped `variables.oid4vp.queryLanguage` and
`.delivery`.** A stamp is the most specific layer of all; left on the copy, an
elected PEX profile served DCQL bytes under a name claiming PEX. A stamp records
what this exchange *was served*; the copy answers what it *would emit under
profile X*.

### The refusals — an election chooses among constructions the exchange is indifferent to

| refused | status |
|---|---|
| an unregistered name | 400 |
| a **by-value** profile | 400 |
| an exchange carrying an explicit knob | 409 |
| an exchange that named its own `protocolProfileName` | 409 |
| a profile differing on a **response-bound** axis (`delivery`, `queryLanguage`, `clientIdPrefix`) | 409 |

⚠️ **Fetchable-only and mint-bound are the same rule seen twice.** A by-reference
construction has a URL that can *carry* an election; a by-value construction *is*
the bytes and has nowhere to put a name. Equally, a construction the **response**
is validated against — `response-handler.ts` parses the `vp_token` in the language
this exchange asked in, and binds the VP proof's `domain` to
`clientIdForExchange` — is a property of the exchange, not of one fetch. Electing
one would serve a request whose valid answer this service then rejects: a false
negative recorded against a wallet.

⚠️ Only the **exchange** layer triggers the fourth refusal. A tenant default or
`DEFAULT_PROTOCOL_PROFILE` is deployment configuration, not a statement about
this exchange, so electing over those is what the feature is for. Naming the
profile the exchange already asks for is **inert**, not refused.

⚠️ **`OID4VP_AXIS_SCOPE` classifies every OID4VP field** as `request` or
`exchange`, and tests enforce that the classification is total and that every
`exchange`-scoped field is actually checked. A new field cannot be added without
somebody ruling on which side it falls.

⚠️ The knob refusal is **temporary** — M7 retires the knobs and it goes with
them. The mint-time-profile refusal is the same intent in the newer vocabulary
and **outlives it**.

### What is offered

`GET /interactions/:id/presets` returns the offerable set — server-built
payloads, an axis diff, and product ids; **no display strings**, because copy
belongs in the UI. Two filters:

1. **Electable only** — the endpoint asks `assertElectable`, so it cannot drift
   from the refusals above.
2. ⚠️ **One entry per distinct payload, per interaction method**, deduped on **the bytes that
   interaction method would deliver** rather than on the payload string. The interaction URL is
   byte-identical under every profile (its construction lives in the envelope it
   *serves*), and the OID4VP deep link can be byte-identical under two
   request-object envelopes, which differ only in what comes back from
   `request_uri`. A hand-listed set of "axes that matter to this interaction method" would be
   a second statement of which fields are wire-affecting; the bytes cannot
   disagree with themselves.

   ⚠️ **Today this filter collapses the OID4VP interaction method to a single row.** Every
   registered profile either differs from the default on a mint-bound axis or
   changes no OID4VP byte at all, so the only alternatives an operator is offered
   are on the interaction URL. That is the filter working, not a gap — but it
   does mean the picker's OID4VP interaction method has nothing to show until a profile varies
   a request-scoped OID4VP axis again.

A profile that cannot be elected is simply **not offered**, silently.

⚠️ **The picker is only as informative as `DEFAULT_PROTOCOL_PROFILE`.** With no
layer naming a profile, the active preset's name is `null` and the axis diff is
empty — there is nothing to diff against. That is the honest encoding, not a bug.
A deployment that wants variant wording in the picker sets the app default.

⚠️ **M6's product→profile mapping is still empty, on purpose**, so every preset's
`productIds` is `[]` and no row renders a *"Works with …"* line. **That line is
where filling the mapping would pay off**: it is the one place a product name and
a construction meet on screen, and it is the argument for populating the table
once a construction is known to work with a named wallet.

### What is recorded

`interaction-method-shown` journals every reported interaction method; `interactionMethodElections` on the exchange record
takes **recognised** elections only — a payload this service can itself rebuild
for an offerable preset — because that endpoint's payload comes from the client.
An unrecognised payload is journalled **and journalled as unrecognised**. The
name is derived from the payload bytes, with `source: 'payload' | 'active'`
distinguishing *the QR named it* from *the server resolved it at that moment*.

⚠️ **The interaction page's `tried` tag is session-scoped**, not read back from
`interactionMethodElections`: the record is written correctly, but the page never fetches it,
so a reload clears the tags. Serving the election set on `GET /interactions/:id`
would change bytes a wallet reads; putting it on the presets response instead is
the cheap fix if it ever matters.

## Where definitions live

**In this repo**, as versioned data this service owns
(`src/protocol-profiles/registry.ts`).

If they lived in the test suite instead, what a deployment emits would depend on
which version of the test suite it happened to have — the same cross-deployment
divergence named profiles exist to prevent, arriving through a dependency
instead of through config. This repo has already been bitten by that exact
shape.

There is a directional argument too: this service is the **product**, the
interoperability suite is the **tests**, and a product's wire behaviour must not
be defined by its tests.

⚠️ Drift is handled by **the test suite asserting the profile this service emits
against its own card**, so drift fails a test rather than going unnoticed —
which only works while the two are separately owned.

## Authoring a profile

1. Add the definition to `DEFINITIONS` in `src/protocol-profiles/registry.ts`.
2. State **every** field, for **every** workflow. If you find yourself wanting a
   default, re-read the totality rule — the verbosity is the mechanism.
3. ⚠️ **Compose at authoring time if you like; never at request time.** A
   generator or shared fragments may produce the entries. What is stored, served
   and cited is always the fully-resolved total definition.
4. Run `pnpm test src/protocol-profiles`. A definition that does not parse
   crashes at import, which is where you want to find out.

### Adding a new wire field

Add it to `types.ts` and to the matching schema in `schema.ts`, then add it to
**every** profile. The totality check will not let you skip that step, and it
is not being kind when it stops you: a field with a default is a field two
deployments can disagree about while both citing the same name.

### Room without pretence

`IssuanceMediaType` lists `application/vc+sd-jwt`, `application/mdoc` and
`application/vcb` so that an SD-JWT or mDoc arm arrives as a **value of an
existing field** rather than as a twelfth orthogonal knob. ⚠️ **Only
`application/vc` has an implemented arm**, and a profile naming any of the
others is refused at parse time, by name. Room in the schema is not a pretence
of capability.

## The authored profiles

Every profile below **reproduces a construction this service already emits**.
Not one introduces a byte.

Each carries the `claim`, `didAuth` and VC-API constructions identically — one
profile serves a whole deployment — so the name describes the axis that varies,
which is the OID4VP arm.

| profile | delivery | query | selective disclosure | ⚠️ exercised on the wire |
|---|---|---|---|---|
| `oid4vp-1.0-json-by-reference-dcql-redirect-uri` | by reference | DCQL | — | ⚠️ **yes — the default** |
| `oid4vp-1.0-by-value-dcql-redirect-uri` | by value | DCQL | — | ⚠️ yes — the delivery comparison's baseline construction |
| `oid4vp-1.0-json-by-reference-pex-redirect-uri` | by reference | PEX | — | ⚠️ yes — a baseline construction |
| `oid4vp-1.0-by-value-pex-redirect-uri` | by value | PEX | — | no |
| `oid4vp-1.0-json-by-reference-pex-limit-disclosure-required-redirect-uri` | by reference | PEX | `required` | no |
| `oid4vp-1.0-json-by-reference-pex-limit-disclosure-preferred-redirect-uri` | by reference | PEX | `preferred` | no |
| `oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier` | by reference | DCQL | — | no — ⚠️ **CONFORMANT and UNPROVEN; see below** |

⚠️ **Two constructions are deliberately absent from this table, and neither may
be registered:**

- **An advertise-to-observe arm.** It would union a cryptosuite this verifier
  does not accept into the list it advertises accepting, to coax a wallet into
  deriving a selective-disclosure proof that would then be captured upstream of
  our own refusal. **Advertising a suite you would refuse is a false statement
  on the wire**, and there is no narrower honest form of it. See
  [ADR 2026-09-10](adr/2026-09-10-advertised-acceptance-equals-actual.md).
- **An unsigned-JWT arm (`alg: none`).** It would be interoperable where the
  strict arm is not, and it could never be claimed as conformant — no published
  OID4VP version permits it. See
  [ADR 2026-08-25](adr/2026-08-25-oid4vp-request-object-envelopes.md) §2, which
  says why an unsigned envelope is not an option.

⚠️ **The last row is the only profile that does not merely reproduce an
existing construction.** It is conformant on the fetchable path and has never
been accepted by a wallet. **Conformant and accepted are two columns and this
table keeps them apart on purpose.**

The signed arm additionally differs from every other profile in three ways worth
knowing before selecting it:

- ⚠️ **It calls another service while a wallet is fetching.** The JWS comes from
  `dcc-signing-service`. A signing outage is a named 502 and **never** a silent
  degrade to an unsigned arm — see `docs/oid4vp-1.0-verifier.md`.
- ⚠️ **It needs an entity identity, and refuses at MINT without one.** A tenant
  with no `TENANT_ISSUER_1_ID_<TENANT>`, or one whose identity is a `did:key`,
  cannot serve it — a `did:key` publishes no document for a wallet to resolve
  the `kid` from. There is no decision yet for a deployment whose tenants are all
  `did:key`.
- ⚠️ **Its signature is forced to EdDSA** where the mDL/EUDI default is ES256, so
  it may prove *less* interoperable than the default JSON arm it sits beside.

### The protocols envelope

What `getProtocols` returns is a VCALM **interaction protocols response**: a map
whose keys are protocol identifiers and whose values are URLs that initiate the
interaction. Which keys appear is a profile decision.

| key | carries | note |
|---|---|---|
| `iu` | the interaction URL | ⚠️ **not** a VCALM protocol name — see below |
| `vcapi` | the exchange id URL | VCALM's `vcapi` interaction protocol |
| `lcw` | a wallet-specific convenience URL | ⚠️ not a VCALM protocol at all; grandfathered |
| `OID4VP` / `oid4vp-1.0` | the `openid4vp://` deep link | **byte-identical**; both emitted |
| `OID4VCI` / `oid4vci-1.0` | the `openid-credential-offer://` deep link | **byte-identical**; both emitted |
| `verifiablePresentationRequest` | the full VPR object | |

**Why both spellings.** VCALM describes the unversioned `OID4VP` / `OID4VCI` as
*"deprecated ... indefinitely retained here for backwards compatibility"* and
advises implementers to use the versioned variants. So both go out, carrying the
same URL: a wallet reading either finds identical bytes, and nothing that read
the old spelling stops working.

⚠️ **Do not read "deprecated" and delete them.** Existing callers and test cases
name `OID4VP` and `OID4VCI`, the method picker keys off them, and the
`interaction-method-shown` journal line records them. The deprecated spelling is emitted
**first**, and the picker shows one entry per distinct payload keeping the first
key — so the vocabulary an operator selects is the same vocabulary a later
reader finds in the journal.

### ⚠️ `interact` is NOT the VCALM name for our interaction URL

The planning material for this work recorded `iu` as *"wrong name; should be
`interact`"*. **That is wrong, and the spec text settles it.** VCALM's table:

> The `interact` interaction protocol is used to redirect a wallet to a
> **different** interaction URL, where the exchange will continue. This protocol
> can be used by exchanges as a delegation mechanism.

`interact` is **delegation**. Our interaction URL is the thing whose GET
*returns* this map — it is not an entry in it. Emitting it under `interact`
would tell a wallet to go somewhere else and land it back here: a wasted round
trip at best, a loop at worst. `coherence.ts` refuses it, quoting the spec.

### The `interaction:` scheme — decided

⚠️ **The scheme is `interaction:` / `web+interaction:`**, not `interact:` /
`web+interact:` as the planning material recorded. From the spec:

> This section defines an `interaction:` protocol scheme format (for native
> apps) and a `web+interaction:` protocol scheme format (for web apps) …
> `scheme = ("interaction:" / "web+interaction:") interaction-url`

**It is an alternative ENCODING of the same interaction URL, not a distinct
construction** — the scheme is a literal prefix on the URL itself:

```
interaction:https://app.example/interactions/z8n38Dp7a?iuv=1
```

Two consequences:

- It is **not** a protocols-map key, so nothing changes in the envelope.
- ⚠️ It does **not** become its own interaction method for render-time selection. It is a way
  to encode a payload the operator can already select, which makes it a QR
  payload variant rather than a construction — worth offering, but as an
  encoding of candidate A, not beside it.

### The VPR differential arms

⚠️ **These vary the Verifiable Presentation Request, not the OID4VP arm — so
they exercise the INTERACTION-URL method and test nothing on the
`openid4vp://` interaction method.** A wallet that fetches `.../openid4vp/request` never reads
a VPR.

Each removes one thing this service emits that other verifiers do not. ⚠️ Every
row of that differential is a field we **add**, which is the shape of a defect
where a stricter-than-necessary parser chokes on an optional member.

| profile | what it omits |
|---|---|
| `vcapi-vpr-bare-origin-domain` | `domain` becomes the bare origin |
| `vcapi-vpr-no-accepted-cryptosuites` | `acceptedCryptosuites`, **both** top-level and on the `DIDAuthentication` query — ⚠️ `acceptedMethods` stays |
| `vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites` | both of the above |

Run any of them from the CLI by name, with no preset file of its own:

```bash
pnpm transaction verify ob3 --protocol-profile vcapi-vpr-bare-origin-domain
```

The flag reaches **every** registered profile in this document and overrides a
profile file's own `protocolProfileName`. An unregistered name is refused by the
service with a `400`.

⚠️ **The singles and the combination are not interchangeable.** A combined run
that completes cannot say which change mattered; only a single-variable profile
attributes a result to one field.

⚠️ **The third differential — omitting `interact.service` — is NOT authorable,
and two rules say why together.** Keeping the `vcapi` envelope key would offer
VC-API pointing at an empty string (that key *is* the first service's
endpoint); dropping the key is refused while `getProtocols` still emits a fixed
key set. It would also not be independently testable: a VPR with no service
entry gives a wallet nowhere to POST, so omitting it changes where a response
goes as well as whether the member is present. That is a different change.

⚠️ **A profile marked "exercised on the wire" cannot have its bytes changed**,
because a name is only useful while it means the same bytes every time. If the
construction moves under the name, a record made before the change and one made
after are not comparable — each becomes a claim about bytes that were never
sent.

All but the last share: `redirect_uri` client_id prefix, unsigned JSON request
object, `direct_post`, `response_uri` emitted, no `client_id_scheme`, no
`request_uri_method`, no `expected_origins`, and the OID4VCI pre-authorized-code
grant offered by reference.

⚠️ **The signed arm is the odd one out and is meant to be.** It is the only
profile that changes the client_id prefix, the only one that calls another
service to build a response, and the only one this service claims conformance
for. See [the OID4VP verifier doc](oid4vp-1.0-verifier.md) and
[the ADR](adr/2026-08-25-oid4vp-request-object-envelopes.md).

### How they are pinned

`src/test-fixtures/protocol-goldens/` holds the bytes each construction produced
**before any profile wiring existed**, captured through the routes.
`protocol-goldens.test.ts` runs the whole matrix twice:

1. **with no profile configured** — proving the migration moved nothing for the
   callers who have not adopted it, which is all of them;
2. **profile-driven with every knob stripped** — proving the profile alone
   reproduces the same bytes.

⚠️ **A failure there means the bytes moved, not that a fixture went stale**, and
there is deliberately no way to regenerate one from inside the repo.

## The knob migration — what moved, what did not, and why

The per-exchange enums that predate this surface are **retired, not removed**.
⚠️ Existing callers and test cases name them, and a re-run months from now must
emit what it emitted the first time — or two records of the same construction
quietly stop meaning the same thing.

Each field below was classified by one question: **does it change what the
wallet sees on the wire?**

### Group 1 — wire construction. Superseded by profile fields.

| knob | superseded by | status |
|---|---|---|
| `oid4vpQueryLanguage` | `workflows.verify.oid4vp.queryLanguage` | deprecated, still read |
| `oid4vpDelivery` | `workflows.verify.oid4vp.delivery` | deprecated, still read |
| `vprLimitDisclosure` | `workflows.verify.oid4vp.limitDisclosure` | deprecated, still read |
| `vprAdvertiseCryptosuites` | — | ⛔ **not honoured — stripped, not deprecated** |

⛔ **`vprAdvertiseCryptosuites` is the one exception to "retired, not removed":
it is not honoured at all, and there is no profile field
(`advertiseCryptosuites`) behind it either.** Its only possible effect is to
union cryptosuite names this verifier does not accept into the list it
advertises accepting — a false statement made on the wire to a party with no way
to check it. There is no narrower honest form of it, so it is refused rather
than kept working. `variables` strips unknown keys, so an exchange citing it is
served the default construction's bytes exactly, without the extra suite name.
See [ADR 2026-09-10](adr/2026-09-10-advertised-acceptance-equals-actual.md).

⚠️ The profile field is often **wider** than the knob it replaces:
`queryLanguage` adds `both`, and `limitDisclosure` states `'none'` where the
knob says nothing. A caller choosing a query language is choosing one; the
both-at-once accommodation is a profile, not a knob.

### Group 2 — per-exchange request CONTENT. Deliberately NOT profile fields.

`vprContext`, `vprCredentialType`, `vprClaims`.

⚠️ **Wire-affecting, and still not profile fields.** They vary per exchange by
design — *what you are asking for* — where a profile varies by construction —
*how you ask*. Putting them in a profile would need a profile per query, which
is a registry explosion and the exact failure flat identity already pays a cost
to avoid.

### Group 3 — service-side controls. Not protocol fields at all.

`tamper`. Corrupts the issued **credential** after signing, not the request
construction. A deliberate-corruption arm, and it stays on the exchange.

### ⚠️ Group 4 — verification controls. Not in the plan's classification, and not wire-affecting.

`trustedIssuers`, `trustedRegistries`.

The planning material grouped `trustedIssuers` with group 2 as *"wire-affecting
but not a profile field"*. **It is not wire-affecting at all.**
`getCredentialQuery` accepts it and discards it — the parameter is named
`_trustedIssuers` — and its real uses are all post-presentation verification.
Nothing it holds appears in any emitted byte.

The action is the same as group 2's (leave it on the exchange), which is why
this is a correction to the reasoning rather than to the outcome.

## Precedence — the knob wins, and where it does not

The order at every resolver:

**stamped value → explicit knob → active profile → historical default**

⚠️ **A knob on the exchange beats a profile from the tenant or the app
default**, which is the reverse of what you might expect and is deliberate:
exchanges in flight were created with these fields, and a profile that outranked
them would silently change what an in-flight exchange emits. Two layers disagreeing
is the resolution rule working — the more specific one wins.

⚠️ **But a knob and `protocolProfileName` on the SAME request is refused**, with
a 400 naming both. That is not two layers disagreeing; it is one caller saying
two things about one wire field in one breath, with no more-specific layer to
break the tie. Serving either one silently would make the profile name a lie
about the bytes.

⚠️ **The historical defaults are consequently stated twice** — once at the call
site, once in the authored profiles. The goldens prove the two agree. They
collapse when the knobs are finally deleted, which is a separate decision with
its own migration for the callers that use them.

### Where the triple declaration went

A knob used to be declared three times — `schema.ts`, the verify workflow's
schema extension, and again as a conditional re-spread at mint — because Zod
strips what it does not name and the route parses the body through the base
schema first. For the four group-1 knobs, two of those three are gone: the
extension re-declared them identically to the base, and the re-spread set fields
that `...data.variables` had already carried.

⚠️ **The fields still re-declared in the verify extension are re-declared
because they genuinely differ** — `vprContext` gains `.url()`, `vprClaims` gains
`id`, and the verify arm makes them required. Do not tidy those away by analogy.

## Migration state

⚠️ **An explicitly set per-exchange knob beats the profile.** That is the
reverse of the end state, and it is deliberate:

- Exchanges in flight were created with `oid4vpDelivery: 'by-value'` and the
  like. If a profile outranked them, configuring one would silently change what
  an in-flight exchange emits — the one thing this work puts out of scope.
- A profile that outranked the knobs would make them dead code immediately,
  which is a retirement, and retirement is its own step with its own migration.

The order at every resolver is therefore **stamped value → explicit knob →
active profile → the historical default**, and each site says so.

⚠️ **The historical defaults are consequently stated twice** — once at the call
site, once in the authored profiles. The goldens prove the two agree. Retiring
the knobs removes the call-site half; do not delete either side before then.

⚠️ **The protocols-envelope key arrays (`interactionUrlKeys` and friends) are
stated but not yet read.** `getProtocols` still emits the fixed key set. Wiring
them is the envelope-additions step, which is where the new VCALM spellings
(`interact`, `oid4vci-1.0`, `oid4vp-1.0`) arrive alongside the legacy ones.
