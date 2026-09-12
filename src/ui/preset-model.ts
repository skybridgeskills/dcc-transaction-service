/**
 * The UI's view of a launch preset: the server's facts, plus the words.
 *
 * ## Why the words are here and not on the wire
 *
 * The presets endpoint returns `payloadId`, `protocolProfileName`, an axis diff
 * and product ids — and nothing a human reads. Base names ("Interaction URL",
 * "OpenID4VP") and the words for an axis are **copy**, and copy belongs in the
 * UI. It also keeps the vendor-naming rule mechanically checkable: the server
 * never emits a vendor name beside a profile name — see
 * `docs/adr/2026-08-24-protocol-profile-surface.md` §7.
 *
 * ## ⚠️ "Interaction method" never reaches the screen
 *
 * It stays a term of art in `interaction-method-shown`,
 * `describeInteractionMethod` and `payloadId` — that is how the evidence is
 * written, and the evidence has its own vocabulary. A person holding a phone
 * has a wallet, not an interaction method.
 *
 * ## ⚠️ The naming collision
 *
 * The type is `LaunchPreset` and the id `launchPresetId`, qualified because
 * "preset" is already spoken for by `src/cli/exchange-presets/` — twelve presets
 * of exchange *variables*. The **user-facing** word is plain "preset", because a
 * user never meets the other one.
 */
import { getWallet, wallets } from '../lib/wallets/index.js'
import type { LaunchPreset } from '../lib/services/exchange-client/exchange-client.js'

export type { LaunchPreset }

/** Select-option id for the interaction URL itself (the URL of this page). */
export const INTERACTION_URL_ID = 'iu'

/**
 * ⚠️ The envelope key that is an **expected refusal**: a payload a
 * conformant wallet ought to decline. Offered on purpose — checking that a
 * wallet declines what it should is a real check, not a broken option.
 */
const EXPECTED_REFUSAL_ID = 'vcapi'

/** The plain-language name for an interaction method. ⚠️ "Interaction method" itself never reaches the screen. */
const BASE_LABEL: Record<string, string> = {
  iu: 'Interaction URL',
  OID4VP: 'OpenID4VP',
  vcapi: 'Bare VC-API URL'
}

/**
 * ⚠️ **The candidate letter — operator decode only, never a row label.** It is
 * the short, stable handle an operator has for the payload they just showed,
 * and `interaction-method-shown` still records `payloadId` beside it. On a row
 * it made the list harder to read — *"Candidate A · This page's link ·
 * bare-origin domain"* asked a reader to hold a letter, a paraphrase and a
 * token at once — and it was never what a run joins on.
 */
const CANDIDATE_LETTER: Record<string, string> = {
  iu: 'A',
  OID4VP: 'B/C',
  vcapi: 'D'
}

/**
 * Construction tokens in words.
 *
 * ⚠️ **Explicit, and it FALLS BACK to the raw token.** A table like this goes
 * stale the moment an axis is added, so an unknown field renders as
 * `queryLanguage: pex` rather than disappearing — a reader sees the flat
 * spelling instead of nothing, and the full profile name is on the row
 * underneath either way.
 *
 * ⚠️ **Do not derive words by string-munging the profile name.** The name is an
 * identity, not a data structure.
 */
const AXIS_WORDS: Record<string, string> = {
  'queryLanguage:pex': 'PEX',
  'queryLanguage:dcql': 'DCQL',
  'queryLanguage:both': 'both query languages',
  'requestObjectFormat:jwt-signed': 'signed JWT',
  'requestObjectFormat:json': 'unsigned JSON',
  'limitDisclosure:required': 'limit disclosure: required',
  'limitDisclosure:preferred': 'limit disclosure: preferred',
  'clientIdPrefix:decentralized-identifier': 'DID client_id',
  'clientIdPrefix:redirect-uri': 'redirect_uri client_id',
  'requestUriMethod:post': 'request_uri_method: post',
  'expectedOrigins:exchange-host': 'expected origins',
  'responseMode:direct_post.jwt': 'response_mode: direct_post.jwt',
  'domainForm:exchange-host': 'bare-origin domain',
  'emitAcceptedCryptosuites:false': 'no accepted cryptosuites',
  'emitDidAuthenticationAcceptedCryptosuites:false':
    'no DIDAuthentication cryptosuites',
  'emitClientIdScheme:true': 'client_id_scheme too',
  'requireSignedRequestObject:declared-false': 'require_signed_request_object: false',
  'requireSignedRequestObject:declared-true': 'require_signed_request_object: true'
}

/** The axis diff in words, falling back to `field: value` for an unknown token. */
export const variantWords = (axes: LaunchPreset['axes']): string =>
  axes
    .map((a) => AXIS_WORDS[`${a.field}:${a.value}`] ?? `${a.field}: ${a.value}`)
    .join(', ')

/** A preset as the picker renders it: the server's facts plus this file's words. */
export interface PresetView {
  preset: LaunchPreset
  /** `Interaction URL`, `OpenID4VP`, a product name. */
  base: string
  /** The difference from the active construction, in words. Absent = it IS it. */
  variant?: string
  /** What this preset IS, when the base name does not already say it. */
  subtext?: string
  /** Product names the wallet TABLE records against this construction. */
  worksWith: string[]
  /** Shown always, or only with **Include advanced options** ticked. */
  audience: 'everyone' | 'operator'
  /** ⚠️ Operator decode only — see {@link CANDIDATE_LETTER}. */
  candidate?: string
  expectedRefusal: boolean
}

/**
 * ⚠️ **Order is the design.** The list is read top-down by somebody who has just
 * failed, so the broadest thing comes first and the narrowest last, and operator
 * rows are appended rather than interleaved — ticking **Advanced** must never
 * move a row the user was about to tap.
 */
const rank = (view: PresetView): number => {
  if (view.expectedRefusal) return 3
  if (!view.preset.isDefault) return 2
  if (view.preset.payloadId === INTERACTION_URL_ID) return 0
  return 1
}

/** Turn the served facts into rows, in the order the list is read. */
export const presetViews = (presets: LaunchPreset[]): PresetView[] =>
  presets
    .map((preset): PresetView => {
      const wallet = getWallet(preset.payloadId)
      const base =
        wallet?.name ?? BASE_LABEL[preset.payloadId] ?? preset.payloadId
      const expectedRefusal = preset.payloadId === EXPECTED_REFUSAL_ID
      const worksWith = preset.productIds
        .map((id) => getWallet(id)?.name)
        .filter((name): name is string => Boolean(name))
        // ⚠️ Never on a row whose base is already that product's name — a row
        // labelled "ASU Pocket" that also says "Works with ASU Pocket" has spent
        // a line saying nothing.
        .filter((name) => name !== base)
      return {
        preset,
        base,
        ...(preset.axes.length ? { variant: variantWords(preset.axes) } : {}),
        ...(subtextFor(preset.payloadId, expectedRefusal)
          ? { subtext: subtextFor(preset.payloadId, expectedRefusal) }
          : {}),
        worksWith,
        audience:
          expectedRefusal || !preset.isDefault ? 'operator' : 'everyone',
        ...(CANDIDATE_LETTER[preset.payloadId]
          ? { candidate: CANDIDATE_LETTER[preset.payloadId] }
          : {}),
        expectedRefusal
      }
    })
    .sort((a, b) => rank(a) - rank(b) || orderOf(a) - orderOf(b))

/**
 * Within a rank: **products first, in the wallet table's order**, then
 * everything else in the server's.
 *
 * ⚠️ A person reads this list looking for the name of the app on their phone, so
 * the product names come before the protocol name. Both orders are stable across
 * builds — a picker whose rows reshuffled between renders is the defect the URL
 * parameter exists to prevent, arriving from the other direction.
 */
const orderOf = (view: PresetView): number => {
  const index = wallets.findIndex((w) => w.id === view.preset.payloadId)
  return index === -1 ? wallets.length : index
}

const subtextFor = (
  payloadId: string,
  expectedRefusal: boolean
): string | undefined => {
  // ⚠️ Says what an expected refusal is FOR. The old all-caps red "A
  // CONTROL THAT SHOULD BE REFUSED" read as a broken or disabled option; it is
  // neither.
  if (expectedRefusal)
    return 'Expected refusal — a wallet should refuse this. Offered so you can check that it does.'
  // ⚠️ Says what the thing IS rather than who it works with. "Works with most
  // wallets" was true and uninformative; this tells a reader why it is the row
  // to try first.
  if (payloadId === INTERACTION_URL_ID) return 'Multi-protocol interaction URL'
  // ⚠️ `OpenID4VP` carries none. "Works with wallets that support OpenID4VP" was
  // circular; when the table records a product, THAT line renders instead.
  return undefined
}
