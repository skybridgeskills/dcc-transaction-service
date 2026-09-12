/**
 * The `ProtocolProfile` type — a named, versioned, TOTAL statement of every
 * byte-affecting choice this service makes when it talks to a wallet.
 *
 * ## What a profile is for
 *
 * This service speaks to wallets that agree on almost nothing. The way that has
 * been absorbed until now is a per-exchange knob per disagreement: eleven of
 * them at the time of writing, each declared in `schema.ts` and again in the
 * workflow schema, each independently settable, and therefore 2^n possible wire
 * behaviours of which a handful have ever been observed. A profile replaces the
 * knobs with a **named combination that is stated in one place, cited by name,
 * and reproducible**.
 *
 * ## The rule that makes it work: TOTALITY
 *
 * ⚠️ **A profile states EVERY field that changes the bytes a wallet receives.
 * There are no defaults and no fallbacks.** A profile missing a wire field is a
 * loud validation error, never a silent fill-in — because a silent fill-in is
 * exactly how two deployments of this service come to emit different bytes
 * while both claiming to run `oid4vp-1.0-json-by-reference-dcql-redirect-uri`,
 * which is the divergence the whole idea exists to prevent.
 *
 * The dividing line is one question, asked of every field:
 *
 * > **Does it change what the wallet sees on the wire?**
 * > Yes → a profile field, fully specified.
 * > No (host, TTL, storage backend, log level) → server config, and a profile
 * > never touches it.
 *
 * **Cost accepted, knowingly:** profiles are verbose, and every new wire field
 * must be added to every profile. That cost IS the mechanism. Do not add an
 * optional field to make a profile shorter — see `schema.ts`, where a test
 * fails the build if you do.
 *
 * ## Why a profile is keyed by workflow
 *
 * ⚠️ **The VPR this service emits is not the same for every workflow, so a
 * profile cannot state one.** Two fields differ today, on the wire, in source
 * you can read: `didAuth` emits three `interact.service` entries (including
 * `CredentialHandlerService`) and a `domain` of the bare exchange host, while
 * `verify` emits two entries and a `domain` of the full per-exchange service
 * endpoint. A single flat VPR section would have to pick one and would break
 * the other's bytes.
 *
 * The alternative — one profile per workflow, named per workflow — was
 * rejected: an app-level default (`DEFAULT_PROTOCOL_PROFILE`) would then be
 * unable to serve a deployment that runs more than one workflow, which every
 * deployment does. Keying the wire statement by workflow keeps **exactly one
 * profile active per exchange** while letting that one profile cover a whole
 * deployment.
 *
 * This is nesting, not inheritance. ⚠️ **Nothing here resolves at request time
 * and nothing merges.** The workflow selects a branch that was already written
 * out in full at authoring time.
 *
 * ## Stated absence, never omission
 *
 * A field that is "not emitted" says so with a value — `'none'`, `false`, `[]`,
 * or a `null` section — never by being missing. `undefined` and `[]` are not
 * the same thing, and this repo has already been bitten by treating them as if
 * they were (`config.ts`, `resolveTrustedRegistries`). An omitted field means
 * "the author forgot"; a stated absence means "the author decided".
 *
 * ## A field is a CONSTRUCTION, not a literal
 *
 * ⚠️ `client_id` is not a string in a profile. It is `redirect_uri:` plus the
 * exchange's response URI, or `decentralized_identifier:` plus the entity DID.
 * The profile says **which construction**; the exchange supplies the identity
 * it is parameterized by. The same split runs through the whole type:
 * **a profile states HOW, the exchange states WHAT.** Credential types,
 * contexts and claims are exchange data and appear nowhere below.
 *
 * ## Naming
 *
 * See `NAME_PATTERN` in `schema.ts`. Flat, lowercase, version in the identity,
 * client_id prefix in the identity, and ⚠️ **never a vendor product name** —
 * a construction-named profile stays true, a vendor-named one becomes a lie on
 * that vendor's next release. The product-name lookup table is a separate
 * thing and deliberately so.
 *
 * @see docs/protocol-profiles.md — the reference for profile authors
 * @see docs/adr/2026-08-24-protocol-profile-surface.md — why it is shaped this way
 */

import type { WalletLinkConstruction } from '../lib/wallets/link-constructions.js'

/**
 * Workflows whose emitted bytes a profile has to state.
 *
 * `healthz` is excluded because it emits no wallet-facing bytes at all: it is
 * not an exchange, it mints nothing, and `getProtocols` is never called for it.
 * Listing it would require every profile to state a wire behaviour that has no
 * wire.
 */
export const PROFILED_WORKFLOW_IDS = ['claim', 'didAuth', 'verify'] as const
export type ProfiledWorkflowId = (typeof PROFILED_WORKFLOW_IDS)[number]

// --- VPR / VC-API -----------------------------------------------------------

/** `interact.service` entry types this service knows how to emit. */
export const VPR_INTERACT_SERVICE_TYPES = [
  'VerifiableCredentialApiExchangeService',
  'UnmediatedPresentationService2021',
  'CredentialHandlerService'
] as const
export type VprInteractServiceType =
  (typeof VPR_INTERACT_SERVICE_TYPES)[number]

/**
 * How `DIDAuthentication.acceptedMethods` entries are spelled.
 *
 * ⚠️ Both forms have shipped from this service. `did-prefixed` (`did:key`) is
 * an earlier spelling this service emitted; the VP Request specification takes
 * the bare method NAME (`key`), and a wallet comparing against the bare name
 * matched nothing and refused before signing. That refusal was our defect, not
 * the wallet's — which is precisely why the form is a stated profile field and
 * not a constant somebody can quietly flip again.
 */
export const VPR_ACCEPTED_METHODS_FORMS = ['bare-name', 'did-prefixed'] as const
export type VprAcceptedMethodsForm = (typeof VPR_ACCEPTED_METHODS_FORMS)[number]

/**
 * What the VPR's `domain` is constructed from.
 *
 * `exchange-host` — the bare origin (`https://host`), as `didAuth` emits.
 * `service-endpoint` — the full per-exchange VC-API URL, as `verify` emits.
 *
 * ⚠️ A live, unexplained differential. Both forms are in production in this
 * one service today; a profile field is how that stops being an accident.
 */
export const VPR_DOMAIN_FORMS = ['exchange-host', 'service-endpoint'] as const
export type VprDomainForm = (typeof VPR_DOMAIN_FORMS)[number]

/**
 * The Verifiable Presentation Request this service emits for one workflow —
 * the payload that reaches a wallet over VC-API, CHAPI and the interaction UI.
 */
export interface VprProfileFields {
  /**
   * `interact.service` entries, in emitted order. Order is a wire fact: a
   * wallet that takes the first entry it recognises gets a different endpoint
   * depending on it.
   *
   * ⚠️ **An empty array omits the whole `interact` member**, not just its
   * `service` array — which is what some verifiers do. ⚠️ It also
   * empties the envelope's `vcapi` key, because that key IS the first service's
   * endpoint; a profile that drops the services while still offering a `vcapi`
   * key is refused by `coherence.ts` rather than served as an empty string.
   */
  interactServices: VprInteractServiceType[]
  /** What `domain` is built from. */
  domainForm: VprDomainForm
  /** Whether the top-level `acceptedCryptosuites` array is emitted. */
  emitAcceptedCryptosuites: boolean
  /**
   * Whether the `DIDAuthentication` query entry carries its **own**
   * `acceptedCryptosuites`, separately from the top-level one.
   *
   * ⚠️ **Split from `acceptedMethods` deliberately, and the shape in the wild
   * is why.** Some verifiers emit `acceptedMethods: [{method:"key"}]` **and no
   * `acceptedCryptosuites`** — on the same query. A single "emit the query's
   * constraints" flag cannot express that shape at all, which meant the one
   * differential we most wanted to test was the one the profile could not
   * state.
   *
   * Whether `acceptedMethods` is emitted is decided by {@link acceptedMethods}
   * being non-empty: an empty list omits the key. Two questions, two fields.
   */
  emitDidAuthenticationAcceptedCryptosuites: boolean
  /** How `acceptedMethods` entries are spelled. See {@link VprAcceptedMethodsForm}. */
  acceptedMethodsForm: VprAcceptedMethodsForm
  /**
   * DID methods named in `acceptedMethods`, in emitted order.
   *
   * ⚠️ **The advertised acceptance must equal the actual acceptance.** A list
   * narrower than what the verifier's document loader resolves turns a
   * conformant wallet's correct refusal into a finding against the wallet.
   * Widen this only alongside the resolver — never ahead of it.
   */
  acceptedMethods: string[]
}

// --- Envelope ---------------------------------------------------------------

/**
 * Which keys of the returned `protocols` object each construction lands in.
 *
 * ⚠️ **Arrays, because the same URL is emitted under more than one key during a
 * rename.** VCALM has deprecated `OID4VCI`/`OID4VP` in favour of `oid4vci-1.0`
 * /`oid4vp-1.0` and renamed our `iu` to `interact`; the legacy spellings stay
 * (existing callers read them) and the new ones are added alongside. That
 * transition is a profile field rather than a hardcoded pair so a deployment
 * talking to a strict client can serve one spelling and no other.
 *
 * An empty array states "this construction is not offered in the envelope",
 * which is different from the construction not being configured at all.
 */
export interface EnvelopeProfileFields {
  /** Keys carrying the `https://…/interactions/<id>` interaction URL. */
  interactionUrlKeys: string[]
  /** Keys carrying the VC-API exchange service endpoint. */
  vcapiKeys: string[]
  /**
   * Keys carrying a wallet-specific convenience URL.
   *
   * ⚠️ **This is the one place a vendor-derived key legitimately appears on the
   * wire** (`lcw`), and it is grandfathered: existing callers read it, so a
   * legacy protocol key is kept rather than renamed — see
   * `docs/adr/2026-08-24-protocol-profile-surface.md` §7. It is NOT a licence
   * to name a profile after a vendor — see `schema.ts`, which enforces the
   * difference on names.
   */
  walletConvenienceKeys: string[]
  /** Keys carrying the OID4VP deep link. */
  oid4vpKeys: string[]
  /** Keys carrying the OID4VCI credential-offer deep link. */
  oid4vciKeys: string[]
  /** Whether the full `verifiablePresentationRequest` object rides in the envelope. */
  emitVerifiablePresentationRequest: boolean
  /**
   * The SHAPE of the wallet-convenience link, named for the shape and never for
   * the product that speaks it.
   *
   * ⚠️ The profile states the shape; the wallet product table states where it
   * points. That split is the point: three products share one shape and differ
   * only in their own address, and a construction named for a vendor becomes a
   * lie on that vendor's next release.
   *
   * ⚠️ Which product's link rides under the grandfathered `lcw` key is not a
   * profile decision — it is legacy, and it is decided at the emit site.
   * `'none'` states that no convenience link is offered.
   */
  walletConvenienceConstruction: WalletLinkConstruction
}

// --- OID4VP -----------------------------------------------------------------

/** How the authorization request reaches the wallet. */
export const OID4VP_DELIVERIES = ['by-value', 'by-reference'] as const
export type Oid4vpProfileDelivery = (typeof OID4VP_DELIVERIES)[number]

/**
 * Which credential query language the request carries.
 *
 * `both` is not a hedge. Some verifiers send `presentation_definition` and
 * `dcql_query` in one request and let the wallet resolve it, and at least one
 * client resolves it. Being able to state that as a profile is the difference
 * between reproducing it and guessing at it.
 */
export const OID4VP_QUERY_LANGUAGES = ['dcql', 'pex', 'both'] as const
export type Oid4vpProfileQueryLanguage =
  (typeof OID4VP_QUERY_LANGUAGES)[number]

/**
 * The Client Identifier Prefix, and therefore what `client_id` is built from.
 *
 * `redirect-uri` — `redirect_uri:` + the response URI. ⚠️ Cannot be signed
 * (§5.9.3) and therefore cannot conformantly be passed by reference (§5.10.1 /
 * RFC 9101 require a signed JWT at `request_uri`).
 * `decentralized-identifier` — `decentralized_identifier:` + the entity DID,
 * whose document supplies the key that verifies a signed request object.
 */
export const OID4VP_CLIENT_ID_PREFIXES = [
  'redirect-uri',
  'decentralized-identifier'
] as const
export type Oid4vpClientIdPrefix = (typeof OID4VP_CLIENT_ID_PREFIXES)[number]

/**
 * What is served at `request_uri`, and what the by-value URL carries.
 *
 * `json` — an unsigned `application/json` object. ⚠️ **Undefined in every
 * published OID4VP version.** Retained because it is the baseline construction
 * every other delivery is compared against. Not a default worth defending.
 * `jwt-signed` — a genuinely signed request object. The conformant arm, and it
 * requires a `decentralized-identifier` client_id to give the wallet a key.
 *
 * ⚠️ **There is no third value, `jwt-unsigned`, and there must not be one.** It
 * would serve the `request_uri` response as `{"alg":"none"}` with an empty
 * signature segment — a JWS-shaped envelope RFC 9101 (JAR) deliberately removed
 * from OIDC Core §6.1, and OID4VP inherits JAR. That some clients resolve a JWT
 * envelope and do not resolve raw JSON is not reason enough to emit a
 * construction no published version permits — see
 * `docs/adr/2026-08-25-oid4vp-request-object-envelopes.md` §2.
 *
 * ⚠️ **Do not add the enum value.** `jwt` means *signed* everywhere in this
 * service — coherence rules, the journal line, the profile names — and an
 * unsigned spelling silently reinterprets every one of them.
 */
export const OID4VP_REQUEST_OBJECT_FORMATS = ['json', 'jwt-signed'] as const
export type Oid4vpRequestObjectFormat =
  (typeof OID4VP_REQUEST_OBJECT_FORMATS)[number]

/** `request_uri_method`; `none` states that the parameter is not emitted. */
export const OID4VP_REQUEST_URI_METHODS = ['none', 'get', 'post'] as const
export type Oid4vpRequestUriMethod =
  (typeof OID4VP_REQUEST_URI_METHODS)[number]

/** `response_mode`. Only `direct_post` has an implemented arm today. */
export const OID4VP_RESPONSE_MODES = ['direct_post', 'direct_post.jwt'] as const
export type Oid4vpResponseMode = (typeof OID4VP_RESPONSE_MODES)[number]

/**
 * `client_metadata.require_signed_request_object` — JAR's own opt-out knob.
 *
 * ⚠️ Three values, not a boolean, because **stating `false` and saying nothing
 * are different bytes and different claims.** RFC 9101's security consideration
 * names this exact metadata value; a verifier that states `false` knows the rule
 * and is opting out of it, where one that omits the key has said nothing at all.
 */
export const OID4VP_REQUIRE_SIGNED_REQUEST_OBJECT = [
  'omitted',
  'declared-false',
  'declared-true'
] as const
export type Oid4vpRequireSignedRequestObject =
  (typeof OID4VP_REQUIRE_SIGNED_REQUEST_OBJECT)[number]

/**
 * What `expected_origins` is constructed from.
 *
 * ⚠️ A construction, not a literal list. An origin written into a profile would
 * be a deployment's hostname baked into data that is meant to be portable
 * across deployments — and the first time it was wrong it would be wrong
 * silently, on a parameter a wallet uses to decide whether to trust us.
 */
export const OID4VP_EXPECTED_ORIGINS_FORMS = ['omitted', 'exchange-host'] as const
export type Oid4vpExpectedOriginsForm =
  (typeof OID4VP_EXPECTED_ORIGINS_FORMS)[number]

/** DIF PE `constraints.limit_disclosure`; `none` states that it is not emitted. */
export const OID4VP_LIMIT_DISCLOSURES = ['none', 'required', 'preferred'] as const
export type Oid4vpProfileLimitDisclosure =
  (typeof OID4VP_LIMIT_DISCLOSURES)[number]

/** Every OID4VP choice that changes the bytes a wallet receives. */
export interface Oid4vpProfileFields {
  /** Protocol version this arm implements. Part of the profile's identity too. */
  version: string
  /** URL scheme of the deep link, without `://` — e.g. `openid4vp`. */
  deepLinkScheme: string
  delivery: Oid4vpProfileDelivery
  queryLanguage: Oid4vpProfileQueryLanguage
  clientIdPrefix: Oid4vpClientIdPrefix
  /**
   * Whether the retired `client_id_scheme` parameter is emitted alongside the
   * prefixed `client_id`. Draft-era wallets read it; 1.0 wallets do not need
   * it. Emitting both is how one request reaches both, at the cost of being
   * strictly conformant to neither.
   */
  emitClientIdScheme: boolean
  requestObjectFormat: Oid4vpRequestObjectFormat
  requestUriMethod: Oid4vpRequestUriMethod
  responseMode: Oid4vpResponseMode
  /**
   * Whether `response_uri` is emitted. It MAY be omitted under the
   * `redirect_uri` prefix, where it equals the `client_id` target.
   */
  emitResponseUri: boolean
  /** See {@link Oid4vpRequireSignedRequestObject} — stated `false` is not omitted. */
  requireSignedRequestObject: Oid4vpRequireSignedRequestObject
  limitDisclosure: Oid4vpProfileLimitDisclosure
  // ⚠️ **There is deliberately no `advertiseCryptosuites` axis here, and there
  // must not be one.** It would union extra suite names into the advertised
  // `client_metadata.vp_formats_supported.*.cryptosuite_values` so a wallet
  // could be coaxed into deriving a selective-disclosure proof this verifier
  // had not asked for. A profile is a total description of emitted bytes, and
  // an axis whose only reachable values are claims we would not honour does not
  // belong on one — the advertised set is `lib/verifiable-cryptosuites.ts`, and
  // nothing per-profile widens it. See
  // `docs/adr/2026-09-10-advertised-acceptance-equals-actual.md`.
  /** See {@link Oid4vpExpectedOriginsForm}. */
  expectedOrigins: Oid4vpExpectedOriginsForm
}

// --- OID4VCI ----------------------------------------------------------------

/**
 * Grant types advertised in the credential offer.
 *
 * ⚠️ **A set, not a choice.** An offer may advertise both and let the wallet
 * pick — the same union move that lets an OID4VP request carry both query
 * languages. `[]` is rejected: an offer with no grants is not a thing to emit.
 */
export const OID4VCI_GRANTS = ['pre-authorized-code', 'authorization-code'] as const
export type Oid4vciGrant = (typeof OID4VCI_GRANTS)[number]

/** Whether the deep link carries the offer or a URI to fetch it from. */
export const OID4VCI_OFFER_DELIVERIES = ['by-value', 'by-reference'] as const
export type Oid4vciOfferDelivery = (typeof OID4VCI_OFFER_DELIVERIES)[number]

/** Every OID4VCI choice that changes the bytes a wallet receives. */
export interface Oid4vciProfileFields {
  /** Protocol version this arm implements. Part of the profile's identity too. */
  version: string
  /** URL scheme of the deep link, without `://` — e.g. `openid-credential-offer`. */
  deepLinkScheme: string
  offerDelivery: Oid4vciOfferDelivery
  grants: Oid4vciGrant[]
}

// --- Issuance media type ----------------------------------------------------

/**
 * The media type of the credential the wallet ends up holding.
 *
 * ⚠️ **Only `application/vc` has an implemented arm.** The other three are
 * listed so that adding an SD-JWT or mDoc arm is a profile field with an
 * existing home rather than a twelfth orthogonal knob — the exact failure this
 * surface exists to end. A profile naming an unimplemented media type is
 * rejected loudly at parse time (see `schema.ts`); the room is in the schema,
 * not in a pretence of capability.
 */
export const ISSUANCE_MEDIA_TYPES = [
  'application/vc',
  'application/vc+sd-jwt',
  'application/mdoc',
  'application/vcb'
] as const
export type IssuanceMediaType = (typeof ISSUANCE_MEDIA_TYPES)[number]

/** Whether the credential is wrapped for transport. */
export const ISSUANCE_ENVELOPES = [
  'none',
  'enveloped-verifiable-credential'
] as const
export type IssuanceEnvelope = (typeof ISSUANCE_ENVELOPES)[number]

/** How the issued credential is typed and wrapped on the wire. */
export interface IssuanceProfileFields {
  mediaType: IssuanceMediaType
  envelope: IssuanceEnvelope
}

// --- The profile ------------------------------------------------------------

/**
 * Everything this service emits for ONE workflow under one profile.
 *
 * `oid4vp`, `oid4vci` and `issuance` are nullable because a workflow genuinely
 * does not emit them — a `didAuth` exchange has no credential offer and no
 * authorization request. ⚠️ **`null` is a statement, not an omission**: it says
 * "this workflow offers no such construction", and it is checked. `vpr` and
 * `envelope` are not nullable: every exchange this service mints emits both.
 */
export interface WorkflowWireProfile {
  envelope: EnvelopeProfileFields
  vpr: VprProfileFields
  oid4vp: Oid4vpProfileFields | null
  oid4vci: Oid4vciProfileFields | null
  issuance: IssuanceProfileFields | null
}

/**
 * A named, versioned, total statement of this service's wire behaviour.
 *
 * ⚠️ **Flat.** No profile references, extends, or is layered onto another
 * profile. Version and client_id prefix are part of the NAME, not modifiers on
 * a generic one, because a "version base" layer is a profile by another name
 * and reintroduces the two-things-active failure at request time.
 */
export interface ProtocolProfile {
  /**
   * The profile's identity — flat, lowercase, hyphenated, carrying protocol
   * family, version, request-object format, delivery and client_id prefix.
   * See `NAME_PATTERN` and `assertProfileNameIsNotVendorNamed` in `schema.ts`.
   */
  name: string
  /** One sentence a human reads in a picker or a test report. */
  description: string
  /** The wire statement for every workflow this service mints. */
  workflows: Record<ProfiledWorkflowId, WorkflowWireProfile>
}
