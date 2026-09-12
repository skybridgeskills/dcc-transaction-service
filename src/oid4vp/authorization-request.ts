/**
 * Pure builders for the OID4VP 1.0 authorization request and the
 * per-exchange URLs it references.
 *
 * These functions are I/O-free; the route handler owns persistence
 * (`ensureOid4vpState` + `saveExchange`) and serving. ⚠️ **Signing is not done
 * here either** — the signed arm's bytes come back from `dcc-signing-service`
 * and are served verbatim; see `lib/request-object-signing.ts`. What this
 * module produces is the claim set, identically on every arm.
 *
 * Spec anchors: §5 (authorization request params), §5.1 / §B.1.3.2.3
 * (`client_metadata.vp_formats_supported`), §5.9.3 (`redirect_uri`
 * client_id prefix — unsigned, all metadata inline) and the
 * `decentralized_identifier` prefix, whose published document supplies the key
 * a signed request object is verified with.
 */
import { wireProfileForExchange } from '../protocol-profiles/for-exchange.js'
import { entityIdentityForTenant } from '../lib/entity-identity.js'
import { getConfig } from '../config.js'
import { buildDcqlQuery } from './dcql.js'
import { buildPresentationDefinition } from './pex.js'
import type {
  Oid4vpClientIdPrefix,
  WorkflowWireProfile
} from '../protocol-profiles/types.js'
import {
  OID4VP_CRYPTOSUITE_VALUES,
  authorizationRequestSchema,
  type AuthorizationRequest
} from './schemas.js'

/** Data Integrity proof type advertised for every supported format. */
const DATA_INTEGRITY_PROOF_TYPE = 'DataIntegrityProof'

/**
 * Per-exchange base URL, mirroring the OID4VCI
 * `credentialIssuerUrlForExchange` shape. All OID4VP endpoints hang off
 * `${base}/openid4vp/*`.
 */
export const verifierUrlForExchange = (
  exchange: App.ExchangeDetailVerify
): string =>
  `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

/** URL the wallet POSTs the `direct_post` response to. */
export const responseUriForExchange = (
  exchange: App.ExchangeDetailVerify
): string => `${verifierUrlForExchange(exchange)}/openid4vp/response`

/**
 * URL the wallet GETs to fetch the authorization request JSON (by reference).
 *
 * @param electionPin a render-time protocol profile election to carry on the
 * URL, when the caller is building a *pinned* offer rather than this exchange's
 * own envelope.
 *
 * ⚠️ **The pin rides HERE, one level inside the deep link, and it has to.**
 * `routes.oid4vpRequest` reads the profile at FETCH time, so a page that pinned
 * only the QR's outer URL would show a `request_uri` that serves the default —
 * a deep link whose bytes disagree with the name that built it.
 *
 * ⚠️ **Absent by default, so no existing construction moves.** The goldens are
 * the guarantee.
 */
export const requestUriForExchange = (
  exchange: App.ExchangeDetailVerify,
  electionPin?: string
): string =>
  `${verifierUrlForExchange(exchange)}/openid4vp/request${
    electionPin
      ? `?protocolProfile=${encodeURIComponent(electionPin)}`
      : ''
  }`

/**
 * Which Client Identifier Prefix this exchange is served — and answered — under.
 *
 * ⚠️ **Split out of {@link clientIdForExchange} so the default lives in ONE
 * place**, the same reason `resolveDelivery` and `resolveQueryLanguage` exist.
 * A second caller needs the prefix without the identity it is parameterized by:
 * `protocol-profiles/for-exchange.ts` compares it across a render-time election,
 * because the response leg binds the VP proof's `domain` to whatever
 * `clientIdForExchange` returns and must not be handed a request built under a
 * different prefix.
 *
 * ⚠️ **Do not restate `'redirect-uri'` anywhere else.** It is the historical
 * default and this is its home.
 */
export const resolveClientIdPrefix = (
  exchange: Pick<
    App.ExchangeDetailVerify,
    'tenantName' | 'variables' | 'workflowId'
  >,
  config: App.Config = getConfig()
): Oid4vpClientIdPrefix =>
  wireProfileForExchange(exchange, config)?.oid4vp?.clientIdPrefix ??
  'redirect-uri'

/**
 * `client_id`, under whichever Client Identifier Prefix the active profile
 * names.
 *
 * ⚠️ **A construction, not a literal** — the profile says WHICH, the exchange
 * supplies the identity it is parameterized by. The two built today:
 *
 * - **`redirect_uri:`** + the response URI (§5.9.3): the verifier is identified
 *   by the very URL the response is posted to. Such requests **cannot be
 *   signed** — there is no key for the wallet to obtain — so they carry all
 *   verifier metadata inline via `client_metadata`. The historical default.
 * - **`decentralized_identifier:`** + the **entity's** DID: the document at
 *   that DID is where the wallet gets the key that verifies the signed request
 *   object. ⚠️ It is an entity identity and not a role identity — see
 *   `lib/entity-identity.ts`, and do not call it "the issuer DID" here.
 *
 * ⚠️ **There is no knob for this and there never was**, so the order is
 * profile → historical default, with no knob layer between them. Every other
 * resolver in this service reads stamped → knob → profile → default; this one
 * has three of the four and says so rather than leaving a reader to wonder
 * which rule it is following.
 *
 * ⚠️ **The audience check reads this too.** `response-handler.ts` binds the VP
 * proof's `domain` to whatever this returns, so the two cannot be allowed to
 * disagree about the prefix — which is why the construction lives in one
 * function and both callers ask it rather than each building a string.
 *
 * @throws {EntityIdentityUnavailableError} when a profile names the
 *   `decentralized-identifier` prefix and the tenant has no entity identity to
 *   put behind it. ⚠️ At MINT, deliberately: `getProtocols` calls this while it
 *   assembles the interaction envelope, so a misconfigured tenant fails at mint
 *   instead of half way through a live exchange.
 */
export const clientIdForExchange = (
  exchange: App.ExchangeDetailVerify,
  config: App.Config = getConfig()
): string => {
  const prefix = resolveClientIdPrefix(exchange, config)
  if (prefix === 'decentralized-identifier') {
    return `decentralized_identifier:${entityIdentityForTenant(exchange.tenantName, config).did}`
  }
  return `redirect_uri:${responseUriForExchange(exchange)}`
}

/**
 * The credential query, in whichever language(s) the exchange asks in.
 *
 * ⚠️ **`both` is the `presentation-query-language-selector`
 * accommodation, and its ambiguity is accepted knowingly.** A request carrying `dcql_query` and `presentation_definition`
 * together leaves the wallet to choose, which makes the response ambiguous to
 * us — the original reason the schema demanded exactly one. But a shipping
 * verifier sends both and a wallet we must interoperate with resolves it,
 * where that same wallet does not resolve our single-language request. An
 * ambiguous response we can read beats no response at all. Every other arm
 * still carries exactly one.
 */
const queryLanguageParams = (
  exchange: App.ExchangeDetailVerify,
  wire: WorkflowWireProfile | undefined
) => {
  // ⚠️ Order: knob → profile → historical default, as everywhere else. The
  // knob cannot express `both`; only a profile can.
  const language =
    exchange.variables.oid4vp?.queryLanguage ??
    exchange.variables.oid4vpQueryLanguage ??
    wire?.oid4vp?.queryLanguage ??
    'dcql'

  // Opt-in selective-disclosure ask; omitted when neither the exchange nor the
  // profile set it, keeping the emitted definition unchanged by default. A
  // profile states `'none'` when the parameter is not emitted, which is a
  // decision; `undefined` here would be an omission.
  const fromProfile = wire?.oid4vp?.limitDisclosure
  const limitDisclosure =
    exchange.variables.vprLimitDisclosure ??
    (fromProfile && fromProfile !== 'none' ? fromProfile : undefined)

  const pex = {
    presentation_definition: buildPresentationDefinition({
      vprClaims: exchange.variables.vprClaims,
      ...(limitDisclosure ? { limitDisclosure } : {})
    })
  }
  const dcql = {
    dcql_query: buildDcqlQuery({ vprClaims: exchange.variables.vprClaims })
  }

  if (language === 'both') return { ...dcql, ...pex }
  return language === 'pex' ? pex : dcql
}

/**
 * The parameters emitted only when an exchange opts into an accommodation.
 *
 * ⚠️ Each is **omitted entirely** unless a profile asks for it, so the strict
 * arms stay byte-identical.
 *
 * `expected_origins` is derived from the exchange host rather than stated as a
 * literal: an origin baked into profile data would be one deployment's hostname
 * travelling inside a definition meant to be portable, and it would be wrong
 * silently — on a parameter a wallet uses to decide whether to trust us.
 */
const accommodationParams = (
  exchange: App.ExchangeDetailVerify,
  wire: WorkflowWireProfile | undefined
) => {
  const oid4vp = wire?.oid4vp
  if (!oid4vp) return {}
  return {
    // The draft-era spelling of the Client Identifier Prefix, beside the
    // prefixed form. One request then reaches a draft wallet and a 1.0 wallet
    // — at the cost of being strictly conformant to neither, which is exactly
    // why this arm is registered as an accommodation.
    ...(oid4vp.emitClientIdScheme ? { client_id_scheme: 'redirect_uri' } : {}),
    ...(oid4vp.requestUriMethod !== 'none'
      ? { request_uri_method: oid4vp.requestUriMethod }
      : {}),
    ...(oid4vp.expectedOrigins === 'exchange-host'
      ? { expected_origins: [exchange.variables.exchangeHost] }
      : {})
  }
}

/**
 * Build the unsigned OID4VP 1.0 authorization request for a verify
 * exchange. `ensureOid4vpState` MUST have run (and been persisted) first
 * so `variables.oid4vp.state` is present.
 *
 * The returned object is validated through {@link authorizationRequestSchema}
 * before it is returned.
 */
export const buildAuthorizationRequest = (
  exchange: App.ExchangeDetailVerify
): AuthorizationRequest => {
  const wire = wireProfileForExchange(exchange)
  // ⚠️ `cryptosuite_values` advertises exactly what this verifier accepts, and
  // there is deliberately no way to widen it. A conformant wallet reads this
  // list before deciding whether to DERIVE a selective-disclosure proof, so a
  // name in it is a promise; naming a suite we would refuse is a false
  // statement made on the wire to a party that has no way to check it.
  //
  // ⚠️ **Do not add a per-exchange widening knob** — not an
  // `advertiseCryptosuites` profile field, not a `vprAdvertiseCryptosuites`
  // variable beside it. Its only use is coaxing a wallet into a derivation that
  // would then be captured upstream of our own verification failing, and there
  // is no narrower honest form of it — see
  // `docs/adr/2026-09-10-advertised-acceptance-equals-actual.md`. The honest
  // advertisement is the only one this service emits.
  const vpFormat = {
    proof_type_values: [DATA_INTEGRITY_PROOF_TYPE],
    cryptosuite_values: [...OID4VP_CRYPTOSUITE_VALUES]
  }
  const request = {
    response_type: 'vp_token' as const,
    response_mode: 'direct_post' as const,
    client_id: clientIdForExchange(exchange),
    // `response_uri` MAY be omitted under the redirect_uri prefix; we
    // include it for robustness (it equals the client_id target URL).
    response_uri: responseUriForExchange(exchange),
    nonce: exchange.variables.challenge,
    ...(exchange.variables.oid4vp?.state
      ? { state: exchange.variables.oid4vp.state }
      : {}),
    ...queryLanguageParams(exchange, wire),
    ...accommodationParams(exchange, wire),
    client_metadata: {
      vp_formats_supported: {
        ldp_vc: vpFormat,
        ldp_vp: vpFormat
      },
      // ⚠️ Stating `false` and saying nothing are different bytes and
      // different claims. `omitted` says nothing; `declared-false` is the
      // honest opt-out in the vocabulary RFC 9101's own security consideration
      // provides. A profile states it only when it means to; the default
      // is to say nothing.
      ...(wire?.oid4vp && wire.oid4vp.requireSignedRequestObject !== 'omitted'
        ? {
            require_signed_request_object:
              wire.oid4vp.requireSignedRequestObject === 'declared-true'
          }
        : {})
    }
  }
  return authorizationRequestSchema.parse(request)
}
