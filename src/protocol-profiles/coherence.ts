/**
 * Combination checks on a protocol profile: the two ways a profile can state
 * every field correctly and still be wrong.
 *
 * ## Why totality is not enough
 *
 * The totality rule catches a field an author forgot. It does not catch a
 * field an author filled in with a value that cannot work — and OID4VP and
 * OID4VCI are option-rich enough that most of their field combinations are not
 * constructions at all. Two examples, both of which parsed cleanly before this
 * file existed:
 *
 * - `queryLanguage: 'dcql'` with `limitDisclosure: 'required'`. ⚠️ **This one
 *   emitted nothing at all.** `limit_disclosure` is a DIF Presentation Exchange
 *   constraint; DCQL has no such field, so the selective-disclosure ask was
 *   dropped on the floor and the request went out asking for everything. A
 *   test run on that profile would have reported a wallet's behaviour under an
 *   ask it never received.
 * - `responseMode: 'direct_post.jwt'`. Nothing reads the field. The service
 *   emitted `direct_post` and said nothing.
 *
 * Both are the same defect wearing different clothes: **a profile that says one
 * thing while the wire says another.** The name is then a lie, and the name is
 * the entire product of this surface.
 *
 * ## The two classes, and why they are kept apart
 *
 * **{@link CONTRADICTIONS}** — wrong no matter what anybody builds. A
 * `redirect_uri` client_id with a signed request object is forbidden by the
 * specification; `request_uri_method` on an arm that has no `request_uri` is
 * meaningless. These entries are permanent.
 *
 * **{@link UNBUILT_ARMS}** — coherent, buildable, not built. `direct_post.jwt`
 * is a real response mode; we do not serve it. Every entry here **pins a field
 * to the value the code actually emits**, which is what makes it safe for a
 * field to be stated but not yet read: it can only hold the value the hardcode
 * produces, so stating it is truthful rather than decorative.
 *
 * ⚠️ **The split is a work list, not taxonomy.** `UNBUILT_ARMS` is the
 * inventory of everything this surface has room for and no code behind. A
 * milestone that builds an arm **deletes its entry here in the same change that
 * wires the field** — and cannot avoid doing so, because until the entry goes
 * the schema refuses to accept the value the new arm needs. That coupling is
 * the point: it makes "wired the field" and "allowed the value" impossible to
 * do separately, which is how a field ends up stated and unread.
 *
 * ⚠️ **Never move an entry from `UNBUILT_ARMS` to `CONTRADICTIONS` to make a
 * failure go away.** They mean different things to a reader deciding what to
 * build next.
 *
 * @see docs/protocol-profiles.md — the pattern, and how to remove a pin
 */
import type {
  ProfiledWorkflowId,
  WorkflowWireProfile
} from './types.js'

/**
 * One rule. `when` is true when the profile is wrong; `problem` says why, in
 * the voice of somebody telling the author what they cannot have and what they
 * can.
 */
export interface CoherenceRule {
  /** Stable identifier, so a test can name the rule it is exercising. */
  id: string
  /** Dotted path within the workflow branch, for the reported issue. */
  path: string[]
  when: (wire: WorkflowWireProfile, workflowId: ProfiledWorkflowId) => boolean
  problem: (wire: WorkflowWireProfile, workflowId: ProfiledWorkflowId) => string
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

// --- Contradictions ---------------------------------------------------------

/** Wrong regardless of what anybody builds. Permanent. */
export const CONTRADICTIONS: CoherenceRule[] = [
  {
    id: 'redirect-uri-cannot-be-signed',
    path: ['oid4vp', 'clientIdPrefix'],
    when: (w) =>
      w.oid4vp?.clientIdPrefix === 'redirect-uri' &&
      (w.oid4vp.requestObjectFormat === 'jwt-signed' ||
        w.oid4vp.requireSignedRequestObject === 'declared-true'),
    problem: () =>
      'The `redirect_uri` client_id prefix cannot carry a signed request object. OID4VP §5.9.3: such requests cannot be signed, because there is no method for the wallet to obtain a trusted key to verify them with — the spec concludes that implementations requiring signed requests cannot use this prefix at all. A signed arm needs the `decentralized-identifier` prefix, whose whole job is to supply that key.'
  },
  {
    id: 'decentralized-identifier-needs-a-signature',
    path: ['oid4vp', 'requestObjectFormat'],
    when: (w) =>
      w.oid4vp?.clientIdPrefix === 'decentralized-identifier' &&
      w.oid4vp.requestObjectFormat !== 'jwt-signed',
    problem: (w) =>
      `The \`decentralized_identifier\` client_id prefix with a "${w.oid4vp?.requestObjectFormat}" request object. The DID is there to give the wallet a key to verify the request with; an unsigned request gives it nothing to verify, and the prefix becomes decoration that costs a DID resolution.`
  },
  {
    // ⚠️ NEWLY REACHABLE, not newly invented, and NOT an entry moved across
    // from `UNBUILT_ARMS` to silence a failure.
    //
    // `declared-true` was pinned as unbuilt while nothing here signed anything.
    // Building the signed arm lifted that pin — and lifting it made a
    // *permanent* wrong combination writable for the first time: a profile that
    // declares this verifier requires signed request objects while serving an
    // unsigned one at the very next fetch. That is wrong no matter what anybody
    // builds, so it belongs here. The pin it replaces said "nobody has built
    // this"; this rule says "this can never be right".
    id: 'require-signed-contradicts-an-unsigned-envelope',
    path: ['oid4vp', 'requireSignedRequestObject'],
    when: (w) =>
      w.oid4vp?.requireSignedRequestObject === 'declared-true' &&
      w.oid4vp.requestObjectFormat !== 'jwt-signed',
    problem: (w) =>
      `\`require_signed_request_object: true\` alongside a "${w.oid4vp?.requestObjectFormat}" request object. The metadata value tells a wallet this verifier requires signed requests; the very next fetch of \`request_uri\` would then hand it an unsigned one. RFC 9101 names this knob so a verifier can state its position honestly — state "declared-false" (the opt-out in the vocabulary the rule provides), or "omitted", or serve "jwt-signed".`
  },
  {
    id: 'by-value-has-no-request-uri',
    path: ['oid4vp', 'requestUriMethod'],
    when: (w) =>
      w.oid4vp?.delivery === 'by-value' && w.oid4vp.requestUriMethod !== 'none',
    problem: (w) =>
      `\`request_uri_method: "${w.oid4vp?.requestUriMethod}"\` on the by-value arm. By value every parameter is inline in the deep link and there is no \`request_uri\`, so this describes how a wallet should perform a fetch that cannot happen.`
  },
  {
    id: 'client-id-scheme-mirrors-the-prefix',
    path: ['oid4vp', 'emitClientIdScheme'],
    when: (w) =>
      w.oid4vp?.emitClientIdScheme === true &&
      w.oid4vp.clientIdPrefix !== 'redirect-uri',
    problem: (w) =>
      `The retired \`client_id_scheme\` parameter alongside the "${w.oid4vp?.clientIdPrefix}" prefix. \`client_id_scheme\` is the draft-era spelling of the prefix, so emitting it means emitting the same choice twice — and the draft had no spelling for this prefix to duplicate.`
  },
  {
    id: 'dcql-has-no-limit-disclosure',
    path: ['oid4vp', 'limitDisclosure'],
    when: (w) =>
      w.oid4vp?.queryLanguage === 'dcql' && w.oid4vp.limitDisclosure !== 'none',
    problem: (w) =>
      `\`limitDisclosure: "${w.oid4vp?.limitDisclosure}"\` with DCQL. \`limit_disclosure\` is a DIF Presentation Exchange constraint (\`constraints.limit_disclosure\`) and DCQL has no equivalent field, so the ask cannot be emitted. ⚠️ Before this check existed the combination parsed and the request went out asking for everything — a run on it would have reported a wallet's behaviour under an ask it never received. State \`queryLanguage: "pex"\`, or \`limitDisclosure: "none"\`.`
  },
  {
    id: 'oid4vp-belongs-to-verify',
    path: ['oid4vp'],
    when: (w, id) => id !== 'verify' && w.oid4vp !== null,
    problem: (_w, id) =>
      `An OID4VP construction on the \`${id}\` branch. Only a verify exchange issues an authorization request; state \`null\` here, which says so.`
  },
  {
    id: 'oid4vci-belongs-to-claim',
    path: ['oid4vci'],
    when: (w, id) => id !== 'claim' && w.oid4vci !== null,
    problem: (_w, id) =>
      `An OID4VCI construction on the \`${id}\` branch. Only a claim exchange offers a credential; state \`null\` here, which says so.`
  },
  {
    id: 'issuance-is-exactly-the-claim-branch',
    path: ['issuance'],
    when: (w, id) => (id === 'claim') !== (w.issuance !== null),
    problem: (_w, id) =>
      id === 'claim'
        ? 'The `claim` branch states no issuance media type. A claim exchange issues a credential, so it has to say in what form; `null` would mean it issues nothing.'
        : `An issuance media type on the \`${id}\` branch, which issues no credential. State \`null\`.`
  },
  {
    id: 'interact-is-delegation-not-our-interaction-url',
    path: ['envelope', 'interactionUrlKeys'],
    when: (w) => w.envelope.interactionUrlKeys.includes('interact'),
    problem: () =>
      '⚠️ `interact` does not mean "our interaction URL". In VCALM it is a DELEGATION mechanism — the `interact` interaction protocol is "used to redirect a wallet to a different interaction URL, where the exchange will continue". Emitting our own interaction URL under it tells a wallet to go somewhere else and lands it back here, which is at best a wasted round trip and at worst a loop. The interaction URL is the thing whose GET returns this map; it is not an entry in it.'
  },
  {
    id: 'a-key-carries-one-construction',
    path: ['envelope'],
    when: (w) => {
      const all = [
        ...w.envelope.interactionUrlKeys,
        ...w.envelope.vcapiKeys,
        ...w.envelope.walletConvenienceKeys,
        ...w.envelope.oid4vpKeys,
        ...w.envelope.oid4vciKeys
      ]
      return new Set(all).size !== all.length
    },
    problem: () =>
      'The same envelope key is claimed by more than one construction. A protocols map is a map: the second write wins silently, and which one that is depends on the order this file happens to assemble them. Give each construction its own keys.'
  },
  {
    id: 'wallet-convenience-key-matches-its-construction',
    path: ['envelope', 'walletConvenienceConstruction'],
    when: (w) =>
      (w.envelope.walletConvenienceConstruction === 'none') !==
      (w.envelope.walletConvenienceKeys.length === 0),
    problem: (w) =>
      w.envelope.walletConvenienceConstruction === 'none'
        ? 'The envelope reserves a key for a wallet-convenience link while the construction states `none` — a key with nothing to put in it.'
        : 'A wallet-convenience construction with no envelope key to land in. A wallet reads the protocols object; a link built and placed under no key is not offered.'
  },
  {
    id: 'vcapi-key-needs-an-endpoint-bearing-service',
    path: ['envelope', 'vcapiKeys'],
    when: (w) =>
      w.envelope.vcapiKeys.length > 0 &&
      !w.vpr.interactServices.some((t) => t !== 'CredentialHandlerService'),
    problem: () =>
      '⚠️ The envelope offers a `vcapi` key, but the VPR states no `interact.service` entry that carries an endpoint — and that key IS the first such entry\'s `serviceEndpoint`. The result would be a `vcapi` key holding an empty string: a protocols object that offers VC-API and points nowhere. Drop the key, or keep a service that carries an endpoint.'
  },
  {
    id: 'oid4vp-keys-match-the-arm',
    path: ['envelope', 'oid4vpKeys'],
    when: (w) => (w.oid4vp !== null) !== (w.envelope.oid4vpKeys.length > 0),
    problem: (w) =>
      w.oid4vp === null
        ? 'The envelope reserves a key for an OID4VP deep link on a branch that states no OID4VP construction — a key with nothing to put in it.'
        : 'An OID4VP construction with no envelope key to land in. A wallet reads the protocols object; a construction that appears under no key is not offered.'
  },
  {
    id: 'oid4vci-keys-match-the-arm',
    path: ['envelope', 'oid4vciKeys'],
    when: (w) => (w.oid4vci !== null) !== (w.envelope.oid4vciKeys.length > 0),
    problem: (w) =>
      w.oid4vci === null
        ? 'The envelope reserves a key for an OID4VCI credential offer on a branch that states no OID4VCI construction — a key with nothing to put in it.'
        : 'An OID4VCI construction with no envelope key to land in. A wallet reads the protocols object; a construction that appears under no key is not offered.'
  }
]

// --- Unbuilt arms -----------------------------------------------------------

/**
 * Coherent, buildable, **not built**. Every entry pins a field to the value the
 * code actually emits.
 *
 * ⚠️ **This is the work list.** Building an arm means deleting its entry here
 * in the same change that wires the field — and the schema will not let you do
 * one without the other, because the value the arm needs stays refused until
 * the entry goes.
 *
 * ⚠️ **Lifting a pin can make a PERMANENT wrong combination reachable, and that
 * belongs in `CONTRADICTIONS` as a new rule.** The JWT arms did this twice:
 * `jwt-request-object-by-value` below became writable when the format pin went,
 * and `require-signed-contradicts-an-unsigned-envelope` above became writable
 * when the `declared-true` pin went. Neither is an entry moved across to dodge
 * a failure — the moved-entry rule is about relabelling something already in a
 * list, and a test guards the two staying disjoint. ⚠️ Neither rule depends on
 * there being an unsigned JWT format in the enum: `json` is itself an unsigned
 * envelope, so both have something to refuse.
 */
export const UNBUILT_ARMS: CoherenceRule[] = [
  {
    // ⚠️ Reachable only once a JWT envelope was allowed above. A Request
    // Object JWT passed by value is the `request` parameter — a different
    // construction from the inline parameters this service emits by value —
    // and before the format pin was lifted this combination could not be
    // written at all.
    id: 'jwt-request-object-by-value',
    path: ['oid4vp', 'requestObjectFormat'],
    when: (w) =>
      w.oid4vp?.delivery === 'by-value' && w.oid4vp.requestObjectFormat !== 'json',
    problem: (w) =>
      `No arm passes a "${w.oid4vp?.requestObjectFormat}" request object by value. By value this service serializes each parameter into the deep-link query string; carrying a Request Object JWT inline is the \`request\` parameter, a different construction with a different wallet code path. Pair a JWT format with by-reference delivery.`
  },
  {
    id: 'response-mode',
    path: ['oid4vp', 'responseMode'],
    when: (w) => !!w.oid4vp && w.oid4vp.responseMode !== 'direct_post',
    problem: (w) =>
      `No arm is built for the "${w.oid4vp?.responseMode}" response mode — there is no response-decryption path. Until one exists, only "direct_post" may be named.`
  },

  {
    id: 'request-uri-method-get',
    path: ['oid4vp', 'requestUriMethod'],
    when: (w) => w.oid4vp?.requestUriMethod === 'get',
    problem: () =>
      'No arm emits `request_uri_method: "get"`. GET is what a wallet does when the parameter is absent, so advertising it adds a parameter and changes nothing; state "none" until there is a reason to say it out loud.'
  },
  {
    id: 'response-uri-omission',
    path: ['oid4vp', 'emitResponseUri'],
    when: (w) => w.oid4vp?.emitResponseUri === false,
    problem: () =>
      'No arm omits `response_uri`. It MAY be omitted under the `redirect_uri` prefix, where it equals the client_id target, but the builder always emits it. Until that is configurable, state `true`.'
  },
  {
    id: 'oid4vp-version',
    path: ['oid4vp', 'version'],
    when: (w) => !!w.oid4vp && w.oid4vp.version !== '1.0',
    problem: (w) =>
      `No arm is built for OID4VP "${w.oid4vp?.version}". The builders are 1.0-native — a draft arm would differ in the client_id prefix spelling and the request parameters, not merely in a version string.`
  },
  {
    id: 'oid4vp-deep-link-scheme',
    path: ['oid4vp', 'deepLinkScheme'],
    when: (w) => !!w.oid4vp && w.oid4vp.deepLinkScheme !== 'openid4vp',
    problem: (w) =>
      `No arm emits a "${w.oid4vp?.deepLinkScheme}://" deep link; the builder hardcodes \`openid4vp://\`. Naming another scheme here would be silently ignored, which is exactly what a stated profile field must never be.`
  },
  {
    id: 'oid4vci-version',
    path: ['oid4vci', 'version'],
    when: (w) => !!w.oid4vci && w.oid4vci.version !== '1.0',
    problem: (w) =>
      `No arm is built for OID4VCI "${w.oid4vci?.version}".`
  },
  {
    id: 'oid4vci-deep-link-scheme',
    path: ['oid4vci', 'deepLinkScheme'],
    when: (w) =>
      !!w.oid4vci && w.oid4vci.deepLinkScheme !== 'openid-credential-offer',
    problem: (w) =>
      `No arm emits a "${w.oid4vci?.deepLinkScheme}://" deep link; the builder hardcodes \`openid-credential-offer://\`.`
  },
  {
    id: 'oid4vci-offer-delivery',
    path: ['oid4vci', 'offerDelivery'],
    when: (w) => !!w.oid4vci && w.oid4vci.offerDelivery !== 'by-reference',
    problem: () =>
      'No arm offers the credential offer by value. `buildOpenIdCredentialOfferDeepLinkByValue` exists but no route emits it, so `getProtocols` would still hand out the by-reference link. Until it is wired, state "by-reference".'
  },
  {
    id: 'oid4vci-grants',
    path: ['oid4vci', 'grants'],
    when: (w) =>
      !!w.oid4vci && !sameSet(w.oid4vci.grants, ['pre-authorized-code']),
    problem: (w) =>
      `No arm is built for grants [${w.oid4vci?.grants.join(', ')}]. Only the pre-authorized-code flow has a token endpoint behind it; advertising a grant this service cannot honour puts a wallet into a flow that dead-ends. Until an authorization-code arm exists, state exactly ["pre-authorized-code"].`
  },
  {
    id: 'issuance-media-type',
    path: ['issuance', 'mediaType'],
    when: (w) => !!w.issuance && w.issuance.mediaType !== 'application/vc',
    problem: (w) =>
      `No issuance arm is built for "${w.issuance?.mediaType}". The field exists so one can be added as a profile value rather than as a new knob; until it is, only "application/vc" may be named.`
  },
  {
    id: 'issuance-envelope',
    path: ['issuance', 'envelope'],
    when: (w) => !!w.issuance && w.issuance.envelope !== 'none',
    problem: (w) =>
      `No issuance arm is built for the "${w.issuance?.envelope}" envelope. The field exists so one can be added as a profile value rather than as a new knob; until it is, only "none" may be named.`
  },

  {
    id: 'did-authentication-accepted-cryptosuites-outside-verify',
    path: ['vpr', 'emitDidAuthenticationAcceptedCryptosuites'],
    when: (w, id) => id !== 'verify' && w.vpr.emitDidAuthenticationAcceptedCryptosuites,
    problem: (_w, id) =>
      `The \`${id}\` branch runs the DID-auth VPR builder, which emits a bare \`{ type: "DIDAuthentication" }\` query and has no arm for putting \`acceptedCryptosuites\` on it. Only the \`verify\` builder emits a constrained query; state \`false\`.`
  },
  {
    id: 'verifiable-presentation-request-omission',
    path: ['envelope', 'emitVerifiablePresentationRequest'],
    when: (w) => w.envelope.emitVerifiablePresentationRequest === false,
    problem: () =>
      'No arm omits `verifiablePresentationRequest` from the protocols envelope. Until that is configurable, state `true`.'
  },
]

/**
 * Every coherence problem in one workflow branch, contradictions first.
 *
 * Contradictions lead because they are the ones that stay true after every arm
 * is built: an author reading a list wants to fix the permanent problem before
 * the temporary one.
 */
export const coherenceProblems = (
  workflowId: ProfiledWorkflowId,
  wire: WorkflowWireProfile
): Array<{ id: string; path: string[]; problem: string }> =>
  [...CONTRADICTIONS, ...UNBUILT_ARMS]
    .filter((rule) => rule.when(wire, workflowId))
    .map((rule) => ({
      id: rule.id,
      path: rule.path,
      problem: rule.problem(wire, workflowId)
    }))
