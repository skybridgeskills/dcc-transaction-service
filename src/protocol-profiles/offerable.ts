/**
 * Which launch presets this exchange may be offered under, computed per request.
 *
 * ## Why the page is told rather than trusted to work it out
 *
 * ⚠️ **The page must never hold a copy of the registry.** A profile definition
 * is a wire-affecting value, and "derived, never copied" is this repo's founding
 * lesson: a second place a construction is stated is a second place it can
 * disagree. So the page renders what the server says is offerable, and the
 * payloads come from the server too — `getProtocols` builds them, exactly as it
 * builds the envelope, rather than the page rebuilding one from parts.
 *
 * ## What a preset IS
 *
 * ⚠️ **A UI grouping over the two parameters that already exist.** `?payload=`
 * names the envelope key and `?protocolProfile=` names the construction. **It is
 * not a third parameter**, nothing new is cited, and every test case that says
 * `?payload=OID4VP` keeps working unchanged.
 *
 * ## Facts, never display strings
 *
 * No labels, no variant words, no "works with" sentence. Base names
 * ("Interaction URL", "OpenID4VP") and the words for an axis are **copy**, and
 * copy belongs in the UI. It also keeps the vendor-naming rule mechanically
 * checkable: no vendor name is ever emitted beside a profile name by this
 * service — see `docs/adr/2026-08-24-protocol-profile-surface.md` §7, and
 * `schema.ts`, which enforces the same rule on names. Product **ids** are
 * returned so the page can match a wallet search; product **names** are looked
 * up in the UI from the same table.
 *
 * ## The two filters, and why the second is on BYTES
 *
 * 1. **Electable only.** A candidate is offered when {@link assertElectable}
 *    accepts it — which is one question with one answer, not a restatement of
 *    the refusals. Fetchable-only, knob-bearing, mint-named and mint-bound all
 *    fall out of it, including refusals added later.
 * 2. ⚠️ **One entry per distinct payload, per interaction method.** The rule
 *    `App.tsx` applied across envelope keys, applied a second time across
 *    constructions: *a construction is only a separate option on an interaction
 *    method if it changes that interaction method's bytes.*
 *
 *    ⚠️ **Implemented literally — build the payload and dedupe on it.** A
 *    hand-listed set of "axes that matter to this interaction method" is a
 *    second statement of which fields are wire-affecting, and it disagrees with
 *    the schema the first time a field is added. The bytes cannot disagree with
 *    themselves. It is also what makes the interaction methods a pin cannot
 *    ride on collapse to one option without anybody enumerating them.
 */
import { getProtocols } from '../exchanges.js'
import { buildAuthorizationRequest } from '../oid4vp/authorization-request.js'
import {
  preferredConstructionFor,
  walletLinkFor,
  wallets,
  type Wallet
} from '../lib/wallets/index.js'
import { getConfig } from '../config.js'
import {
  tryResolveProtocolProfile,
  wireProfileForExchange
} from './for-exchange.js'
import { assertElectable, electedProfileExchange } from './election.js'
import { PROTOCOL_PROFILES, protocolProfileNames } from './registry.js'
import type { ProfiledWorkflowId, ProtocolProfile } from './types.js'

/**
 * One offerable pairing of an interaction method and a construction.
 *
 * ⚠️ Everything here is a **fact**. See the module docblock for why there is no
 * `label`, no `variant` and no `worksWith` sentence.
 */
export interface OfferablePreset {
  /** `<payloadId>` for the active construction, `<payloadId>:<profile>` otherwise. */
  id: string
  /** ⚠️ The envelope key — what `interaction-method-shown` records and every run joins on. */
  payloadId: string
  /**
   * The construction this preset serves under, or `null`.
   *
   * ⚠️ **`null` is only ever the ACTIVE preset, and only when no layer names a
   * profile** — the state every deployment is in until `DEFAULT_PROTOCOL_PROFILE`
   * is set. It means "whatever this service emits by default", which is a
   * truthful thing to say and a name is not: attributing those bytes to a name
   * nobody configured is the guess `resolveProtocolProfileName` refuses to make.
   */
  protocolProfileName: string | null
  /** ⚠️ The construction this exchange serves with no pin at all. */
  isDefault: boolean
  /**
   * How this construction differs from the active one, leaf by leaf.
   *
   * ⚠️ **Computed generically from the profile objects, never from a hand-listed
   * axis set.** M1's audit found 17 profile fields stated and read by nothing; a
   * hand-listed diff is that failure with a UI attached, where a new field
   * silently stops appearing. A generic walk diffs a new field the day it lands,
   * and the UI's word table falls back to the raw token so it renders as
   * `queryLanguage: pex` rather than as nothing.
   *
   * ⚠️ Empty when there is nothing to diff against — see
   * {@link OfferablePreset.protocolProfileName}.
   */
  axes: Array<{ field: string; value: string }>
  /** Product ids the wallet table records against this construction. Usually empty. */
  productIds: string[]
  /** ⚠️ Server-built. The page renders the QR from this and never constructs one. */
  payload: string
}

/** One interaction method: an envelope key, and how to build its payload under a candidate. */
interface InteractionMethod {
  payloadId: string
  build: (exchange: App.ExchangeDetailBase, electionPin?: string) => string | undefined
}

/**
 * ⚠️ **Everything this service would serve THROUGH an interaction method under
 * one construction** — which is what filter 2 dedupes on, and it is not the
 * payload string.
 *
 * Two interaction methods make that distinction load-bearing:
 *
 * - The interaction URL is **byte-identical under every profile** — the
 *   construction lives in the envelope it serves, not in its own address. Keyed
 *   on the URL alone, the three `vcapi-vpr-*` arms would collapse into the
 *   default on the one interaction method they exist to vary.
 * - The OID4VP deep link can be byte-identical under two request-object
 *   envelopes — the envelope differs only in what comes back from
 *   `request_uri`, not in the address the wallet is handed. Keyed on the deep
 *   link alone, a profile that changes only the envelope would disappear.
 *
 * ⚠️ **Derived from the payload bytes, the way `describeInteractionMethod`
 * derives an interaction method.** A payload carrying an address this service
 * re-reads delivers whatever that address serves, so the fingerprint follows it
 * — rather than a hand-listed map of which interaction method delivers what,
 * which is the statement that goes stale.
 *
 * ⚠️ **The pin is deliberately NOT in the fingerprint.** It is the *name* of the
 * construction, not part of it; including it would make every candidate differ
 * from every other by construction and filter 2 would never collapse anything.
 */
const deliveredBytes = (
  payload: string,
  exchange: App.ExchangeDetailBase
): string => {
  const parts = [payload]
  const interactionUrl = `${exchange.variables.exchangeHost}/interactions/${exchange.exchangeId}`
  if (payload.startsWith(interactionUrl)) {
    parts.push(JSON.stringify(getProtocols(exchange)))
  }
  // ⚠️ **`payload`, not `parts`** — this interaction method's OWN address, not
  // one reachable from it. An election rides on the URL that is fetched, so a
  // `request_uri` nested inside a served envelope carries no pin and delivers
  // this exchange's own construction; it is a fact about the OID4VP interaction
  // method, not about this one. Folding it in here would make the accommodation
  // look like a distinct option on the interaction-URL method while that method
  // delivers nothing of the sort.
  if (exchange.workflowId === 'verify' && payload.includes('request_uri=')) {
    const verify = exchange as App.ExchangeDetailVerify
    parts.push(JSON.stringify(buildAuthorizationRequest(verify)))
    // ⚠️ The ENVELOPE too, and separately. Two envelopes can carry an identical
    // request object and still be two different things on the wire — a wallet
    // that resolves one and refuses the other is the case this distinguishes.
    parts.push(
      wireProfileForExchange(exchange)?.oid4vp?.requestObjectFormat ?? 'json'
    )
  }
  return parts.join('\u0000')
}

/**
 * The interaction methods this exchange has, in the order the envelope states
 * them.
 *
 * ⚠️ **Envelope keys are deduped on their VALUE, first key wins** — the rule
 * `App.tsx` used to apply client-side, moved here. `OID4VP` and `oid4vp-1.0`
 * hold byte-identical URLs because VCALM keeps the deprecated spelling
 * indefinitely, and listing both would put two interaction methods in the
 * picker that cannot be told apart by looking at them. The deprecated spelling
 * is emitted first on purpose: it is the id every recorded run cites and the id
 * `interaction-method-shown` records.
 *
 * ⚠️ **A product absent from the envelope still gets an interaction method**,
 * built from the wallet table's own construction — the fallback
 * `resolvePayload` used to make in the page. It is here now for the same reason
 * everything else is: the page must not build a payload.
 */
const interactionMethodsFor = (exchange: App.ExchangeDetailBase): InteractionMethod[] => {
  const envelope = getProtocols(exchange) as Record<string, unknown>
  const methods: InteractionMethod[] = []
  const seen = new Set<string>()
  for (const [key, value] of Object.entries(envelope)) {
    if (typeof value !== 'string') continue
    if (seen.has(value)) continue
    seen.add(value)
    methods.push({
      payloadId: key,
      build: (ex, pin) => {
        const built = getProtocols(ex, pin ? { electionPin: pin } : {}) as Record<
          string,
          unknown
        >
        const payload = built[key]
        return typeof payload === 'string' ? payload : undefined
      }
    })
  }

  const serviceEndpoint = typeof envelope.vcapi === 'string' ? envelope.vcapi : ''
  for (const wallet of wallets) {
    if (methods.some((d) => d.payloadId === wallet.id)) continue
    const construction = preferredConstructionFor(wallet.id)
    const link =
      construction && walletLinkFor(wallet.id, construction, { serviceEndpoint })
    if (!link) continue
    methods.push({ payloadId: wallet.id, build: () => link })
  }
  return methods
}

/**
 * Every leaf on which `candidate`'s workflow branch differs from `active`'s.
 *
 * ⚠️ **Exported so a test exercises THIS walk**, not a second one written to
 * agree with it. A parallel implementation in a test file is the same
 * derived-twice defect this module exists to avoid, one layer up.
 *
 * Recursive and field-agnostic: it walks whatever the profile objects hold, so a
 * field added to the schema tomorrow diffs tomorrow. Array and object values are
 * compared by their JSON, and reported that way — the UI's word table falls back
 * to the raw token, so an unrecognised shape renders rather than disappearing.
 */
export const axisDiff = (
  active: unknown,
  candidate: unknown,
  path: string[] = []
): Array<{ field: string; value: string }> => {
  if (
    active &&
    candidate &&
    typeof active === 'object' &&
    typeof candidate === 'object' &&
    !Array.isArray(active) &&
    !Array.isArray(candidate)
  ) {
    const keys = new Set([
      ...Object.keys(active as object),
      ...Object.keys(candidate as object)
    ])
    return [...keys].flatMap((key) =>
      axisDiff(
        (active as Record<string, unknown>)[key],
        (candidate as Record<string, unknown>)[key],
        [...path, key]
      )
    )
  }
  if (JSON.stringify(active) === JSON.stringify(candidate)) return []
  return [
    {
      // ⚠️ The LEAF name, not the dotted path. `queryLanguage` is what the
      // profile schema calls it and what a test case cites; `verify.oid4vp
      // .queryLanguage` is this service's internal nesting and means nothing to
      // a reader of the picker.
      field: path[path.length - 1] ?? '',
      value:
        typeof candidate === 'string' ? candidate : JSON.stringify(candidate)
    }
  ]
}

/** Product ids the wallet table records against a construction. Usually empty. */
const productIdsFor = (
  profileName: string | null,
  registry: Wallet[]
): string[] =>
  profileName
    ? registry
        .filter((w) => w.protocolProfileName === profileName)
        .map((w) => w.id)
    : []

/**
 * The presets this exchange may be offered, computed and never persisted.
 *
 * ⚠️ **The ACTIVE construction is always first, on every interaction method**,
 * and it is the one row that carries no pin. Everything after it is a diff of
 * it, so it has to lead — and the page's inert-on-default rule is the same fact
 * seen from the other end: selecting the first row writes no `protocolProfile`
 * at all.
 */
export const offerablePresets = (
  exchange: App.ExchangeDetailBase,
  config: App.Config = getConfig(),
  /**
   * ⚠️ Injectable, defaulting to the shipped table — the shape every lookup in
   * `lib/wallets` uses, and for the same reason: a test exercises the
   * construction that ships rather than a parallel one, and nothing is tempted
   * to mutate the real table to make a case pass.
   */
  walletRegistry: Wallet[] = wallets
): OfferablePreset[] => {
  const activeProfile = tryResolveProtocolProfile(exchange, config)
  const activeName = activeProfile?.name ?? null
  const workflowId = exchange.workflowId as ProfiledWorkflowId

  // ⚠️ ONE question, asked of the one function that answers it. Every refusal —
  // fetchable-only, knob-bearing, mint-named, mint-bound — falls out of this,
  // including refusals added after this line was written.
  const electable: ProtocolProfile[] = protocolProfileNames()
    .filter((name) => name !== activeName)
    .filter((name) => {
      try {
        assertElectable(exchange, name, config)
        return true
      } catch {
        return false
      }
    })
    .map((name) => PROTOCOL_PROFILES[name]!)

  const presets: OfferablePreset[] = []
  for (const method of interactionMethodsFor(exchange)) {
    const seen = new Set<string>()

    const activePayload = method.build(exchange)
    if (activePayload) {
      seen.add(deliveredBytes(activePayload, exchange))
      presets.push({
        id: method.payloadId,
        payloadId: method.payloadId,
        protocolProfileName: activeName,
        isDefault: true,
        axes: [],
        productIds: productIdsFor(activeName, walletRegistry),
        payload: activePayload
      })
    }

    for (const candidate of electable) {
      const copy = electedProfileExchange(exchange, candidate.name, config)
      const payload = method.build(copy, candidate.name)
      // ⚠️ Filter 2, literally. Same delivered bytes on this interaction method
      // → not a separate option on this interaction method. This is what
      // collapses the three `vcapi-vpr-*` profiles into the default on `OID4VP`
      // while keeping them distinct on `iu`, without anybody stating which axes
      // matter where.
      if (!payload) continue
      const fingerprint = deliveredBytes(method.build(copy) ?? payload, copy)
      if (seen.has(fingerprint)) continue
      seen.add(fingerprint)
      presets.push({
        id: `${method.payloadId}:${candidate.name}`,
        payloadId: method.payloadId,
        protocolProfileName: candidate.name,
        isDefault: false,
        axes: activeProfile
          ? axisDiff(
              activeProfile.workflows[workflowId],
              candidate.workflows[workflowId]
            )
          : [],
        productIds: productIdsFor(candidate.name, walletRegistry),
        payload
      })
    }
  }
  return presets
}
