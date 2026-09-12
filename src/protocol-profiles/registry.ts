/**
 * The registry of protocol profile definitions — the service's own, versioned
 * data.
 *
 * ## Why the definitions live HERE
 *
 * A profile's definition belongs to the thing that emits the bytes. If it lived
 * in the test suite instead, what a deployment emits would depend on which
 * version of the test suite it happened to have — the same divergence across
 * deployments that named profiles exist to prevent, arriving through a
 * dependency rather than through config. This repo has already been bitten by
 * exactly that shape: code here depended on endpoints a later commit in the
 * test-suite repo deleted, and it broke without either side changing its mind
 * about anything.
 *
 * There is a directional argument too. This service is the **product**; the
 * interoperability test suite is the **tests**. A product's wire behaviour must
 * not be defined by its tests.
 *
 * ⚠️ **Drift is handled by the test suite asserting the profile this service
 * emits against its own card**, so drift fails a test rather than going
 * unnoticed — which only works while the two are separately owned. Do not
 * "simplify" by moving definitions across the boundary.
 *
 * ## Authoring-time composition only
 *
 * Profiles multiply — protocol × version × option set × client_id prefix — and
 * they share a great deal of content. ⚠️ **A generator or shared fragments MAY
 * produce the entries below.** What is stored, served and cited is always the
 * fully-resolved total definition. If anything in this file resolves, merges or
 * inherits at request time, the rule has been broken.
 *
 * ## What is authored here
 *
 * ⚠️ **Every profile below reproduces a construction this service already
 * emits.** Not one of them introduces a byte. They are pinned against goldens
 * captured from source that had no profile wiring in it —
 * `src/test-fixtures/protocol-goldens/` — and
 * `protocol-goldens.test.ts` runs the whole matrix twice, once with no profile
 * configured and once with each of these driving it, asserting the two are
 * identical.
 *
 * ⚠️ **Marked `exercisedOnTheWire` in `docs/protocol-profiles.md`: the ones
 * whose bytes cannot change without making a record written before the change
 * and one written after it incomparable.**
 */
import { parseProtocolProfile } from './schema.js'
import type {
  EnvelopeProfileFields,
  Oid4vpProfileFields,
  ProtocolProfile,
  VprProfileFields,
  WorkflowWireProfile
} from './types.js'

// --- Authoring-time fragments ----------------------------------------------
//
// ⚠️ Composition happens HERE, at authoring time, and nowhere else. What is
// stored, served and cited is always the fully-resolved total definition the
// spread below produces; nothing resolves or merges at request time.

/** The VPR `getDIDAuthVPR` emits — used by `claim` and `didAuth` alike. */
const DID_AUTH_VPR: VprProfileFields = {
  interactServices: [
    'VerifiableCredentialApiExchangeService',
    'UnmediatedPresentationService2021',
    'CredentialHandlerService'
  ],
  domainForm: 'exchange-host',
  emitAcceptedCryptosuites: true,
  // ⚠️ The bare `{ type: 'DIDAuthentication' }` query — no cryptosuites and no
  // methods on it. Different from the verify VPR, on the wire, today.
  emitDidAuthenticationAcceptedCryptosuites: false,
  acceptedMethodsForm: 'bare-name',
  acceptedMethods: []
}

/** The VPR `getVerifyVPR` emits. */
const VERIFY_VPR: VprProfileFields = {
  interactServices: [
    'VerifiableCredentialApiExchangeService',
    'UnmediatedPresentationService2021'
  ],
  domainForm: 'service-endpoint',
  emitAcceptedCryptosuites: true,
  emitDidAuthenticationAcceptedCryptosuites: true,
  // ⚠️ DID method NAMES, not `did:`-prefixed. The prefixed form is an earlier
  // spelling this service emitted, and it made a client's correct refusal to
  // match look like a defect in the client. Do not "restore" it.
  acceptedMethodsForm: 'bare-name',
  acceptedMethods: ['key', 'web', 'jwk']
}

/**
 * ⚠️ **Both spellings, deprecated one FIRST, carrying identical bytes.**
 *
 * VCALM advises implementers to use the versioned variants and describes the
 * unversioned ones as *"deprecated ... indefinitely retained here for backwards
 * compatibility"*. So both go out: a wallet reading either finds the same URL.
 *
 * ⚠️ The deprecated spelling leads on purpose. It is the id existing callers
 * and test cases name, the id the interaction page's method picker shows, and
 * the id the `interaction-method-shown` journal line records — so the
 * vocabulary an operator selects is the vocabulary a later reader finds in the
 * journal. Leading with the versioned spelling would split one construction's
 * records across two names.
 */
const OID4VP_KEYS = ['OID4VP', 'oid4vp-1.0']
const OID4VCI_KEYS = ['OID4VCI', 'oid4vci-1.0']

const BASE_ENVELOPE: EnvelopeProfileFields = {
  interactionUrlKeys: ['iu'],
  vcapiKeys: ['vcapi'],
  walletConvenienceKeys: ['lcw'],
  oid4vpKeys: [],
  oid4vciKeys: [],
  emitVerifiablePresentationRequest: true,
  // The issuer/auth/challenge shape is what claim and didAuth emit today.
  walletConvenienceConstruction: 'issuer-auth-challenge-query'
}

const CLAIM_WIRE: WorkflowWireProfile = {
  envelope: { ...BASE_ENVELOPE, oid4vciKeys: OID4VCI_KEYS },
  vpr: DID_AUTH_VPR,
  oid4vp: null,
  oid4vci: {
    version: '1.0',
    deepLinkScheme: 'openid-credential-offer',
    offerDelivery: 'by-reference',
    grants: ['pre-authorized-code']
  },
  issuance: { mediaType: 'application/vc', envelope: 'none' }
}

const DID_AUTH_WIRE: WorkflowWireProfile = {
  envelope: BASE_ENVELOPE,
  vpr: DID_AUTH_VPR,
  oid4vp: null,
  oid4vci: null,
  issuance: null
}

/**
 * The OID4VP fields every profile below shares. Only `delivery`,
 * `queryLanguage` and `limitDisclosure` vary across the authored set — the
 * other ten are what this service emits, full stop.
 *
 * ⚠️ `requestObjectFormat: 'json'` is accurate on the by-value arm too: the
 * object-valued parameters are JSON-serialized into the query string. It is
 * `jwt-signed` that only means something by reference.
 */
const OID4VP_BASE: Oid4vpProfileFields = {
  version: '1.0',
  deepLinkScheme: 'openid4vp',
  delivery: 'by-reference',
  queryLanguage: 'dcql',
  clientIdPrefix: 'redirect-uri',
  emitClientIdScheme: false,
  requestObjectFormat: 'json',
  requestUriMethod: 'none',
  responseMode: 'direct_post',
  emitResponseUri: true,
  requireSignedRequestObject: 'omitted',
  limitDisclosure: 'none',
  expectedOrigins: 'omitted'
}

const verifyWire = (oid4vp: Oid4vpProfileFields): WorkflowWireProfile => ({
  envelope: {
    ...BASE_ENVELOPE,
    oid4vpKeys: OID4VP_KEYS,
    // ⚠️ Verify emits the OTHER shape, at the other path. Not a preference —
    // it is what the recorded runs captured.
    walletConvenienceConstruction: 'protocols-json-query'
  },
  vpr: VERIFY_VPR,
  oid4vp,
  oid4vci: null,
  issuance: null
})

/**
 * One profile, named for its OID4VP construction.
 *
 * ⚠️ The name describes the axis that varies. Every profile also carries the
 * `claim`, `didAuth` and VC-API constructions, identically — a deployment runs
 * one profile across every workflow, so the name says what distinguishes it,
 * not everything it contains.
 */
const profile = (
  name: string,
  description: string,
  oid4vp: Partial<Oid4vpProfileFields>,
  verifyVpr: Partial<VprProfileFields> = {}
): ProtocolProfile => ({
  name,
  description,
  workflows: {
    claim: CLAIM_WIRE,
    didAuth: DID_AUTH_WIRE,
    verify: {
      ...verifyWire({ ...OID4VP_BASE, ...oid4vp }),
      vpr: { ...VERIFY_VPR, ...verifyVpr }
    }
  }
})

/**
 * Definitions as authored, before validation. Kept separate from the exported
 * map so that every entry goes through {@link parseProtocolProfile} on the way
 * out and nothing can be added that skips the totality check.
 */
const DEFINITIONS: unknown[] = [
  profile(
    'oid4vp-1.0-json-by-reference-dcql-redirect-uri',
    '⚠️ The default construction. Unsigned JSON at request_uri, DCQL, redirect_uri client_id prefix.',
    {}
  ),
  profile(
    'oid4vp-1.0-by-value-dcql-redirect-uri',
    'Every parameter inline in the deep link — the only conformant delivery under the redirect_uri prefix, and the baseline construction for delivery comparisons. DCQL.',
    { delivery: 'by-value' }
  ),
  profile(
    'oid4vp-1.0-json-by-reference-pex-redirect-uri',
    'Unsigned JSON at request_uri, DIF Presentation Exchange instead of DCQL. A baseline construction.',
    { queryLanguage: 'pex' }
  ),
  profile(
    'oid4vp-1.0-by-value-pex-redirect-uri',
    'Both non-default axes at once: inline delivery and Presentation Exchange.',
    { delivery: 'by-value', queryLanguage: 'pex' }
  ),
  profile(
    'oid4vp-1.0-json-by-reference-pex-limit-disclosure-required-redirect-uri',
    'Presentation Exchange asking for selective disclosure in its strict form — a conformant wallet returns only the matched fields.',
    { queryLanguage: 'pex', limitDisclosure: 'required' }
  ),
  profile(
    'oid4vp-1.0-json-by-reference-pex-limit-disclosure-preferred-redirect-uri',
    'The same ask in its permissive form. A different emitted byte, not a shade of the same one.',
    { queryLanguage: 'pex', limitDisclosure: 'preferred' }
  ),
  // ⚠️ **Do not register an unsigned-JWT profile here.** It would serve the
  // `request_uri` response as an `alg: none` request-object JWT — with the
  // maximal accommodation bundle around it — for clients that resolve a JWT
  // envelope and do not resolve raw JSON. That interoperability does not buy a
  // construction no published OID4VP version permits; see
  // `docs/adr/2026-08-25-oid4vp-request-object-envelopes.md` §2. The conformant
  // signed arm below is the only request-object JWT envelope this service
  // serves, and the raw-JSON arm beside it is the other.
  profile(
    'oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier',
    '⚠️ CONFORMANT on the fetchable path, and UNPROVEN against any wallet — two separate claims, kept separate. Serves the request_uri response as a genuinely signed request-object JWT under the `decentralized_identifier` client_id prefix, whose published DID document supplies the key. Signed by dcc-signing-service under the tenant\'s ENTITY identity (not a role identity). ⚠️ The signature is EdDSA and cannot be anything else — the did:web driver cannot express a P-256 verification method — while ES256 is the mDL/EUDI default, so this arm may prove LESS interoperable in practice than the raw-JSON arm beside it. NOT the default.',
    {
      requestObjectFormat: 'jwt-signed',
      clientIdPrefix: 'decentralized-identifier',
      requireSignedRequestObject: 'declared-true'
    }
  ),
  // --- The VPR differential arms -------------------------------------------
  //
  // ⚠️ These vary the VERIFIABLE PRESENTATION REQUEST, not the OID4VP arm, so
  // they exercise the **interaction-URL interaction method** and are useless on
  // the `openid4vp://` interaction method — a wallet that fetches
  // `.../openid4vp/request` never reads a VPR at all.
  //
  // Each is a single-variable change off the default, and each removes an
  // optional member this service emits that other verifiers omit. ⚠️ Every
  // field in that differential is one we ADD, which is the shape of a defect
  // where a stricter-than-necessary parser chokes on an optional member.
  //
  // ⚠️ **The third variant, "omit `interact.service`", is deliberately absent
  // and cannot be authored yet.** Two rules refuse it together and both are
  // right: keeping the `vcapi` envelope key would offer VC-API pointing at an
  // empty string, and dropping the key is refused while `getProtocols` still
  // emits a fixed key set. It also would not be a single-variable change — a
  // VPR with no service entry gives a wallet nowhere to POST, so removing it
  // only makes sense alongside another way to reach the submission endpoint.
  // That is a different change from this one.
  profile(
    'vcapi-vpr-bare-origin-domain',
    'Single-variable arm: the VPR `domain` as a bare origin rather than the full per-exchange URL. Everything else is the default construction. ⚠️ A bare origin is not the conformant spelling; this arm exists because some clients compare against it, and accepting it from one client says nothing about any other.',
    {},
    { domainForm: 'exchange-host' }
  ),
  profile(
    'vcapi-vpr-no-accepted-cryptosuites',
    'Single-variable arm: omit `acceptedCryptosuites` from BOTH positions — top-level and on the `DIDAuthentication` query — while keeping `acceptedMethods`. Some verifiers emit that pairing, and serving it is why the two are separate profile fields.',
    {},
    {
      emitAcceptedCryptosuites: false,
      emitDidAuthenticationAcceptedCryptosuites: false
    }
  ),
  profile(
    'vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites',
    'Combined arm: both VPR omissions at once. ⚠️ It changes two variables, so an exchange that completes under it cannot say which omission mattered. The two single-variable arms above are what distinguish them.',
    {},
    {
      domainForm: 'exchange-host',
      emitAcceptedCryptosuites: false,
      emitDidAuthenticationAcceptedCryptosuites: false
    }
  )
]

/**
 * Validate a list of authored definitions into a frozen name → profile map.
 *
 * Exported so the same construction a deployment runs is the one a test
 * exercises. A test that built its registry a different way would be checking
 * a different thing than the one that ships.
 */
export const buildProtocolProfileRegistry = (
  definitions: unknown[]
): Readonly<Record<string, ProtocolProfile>> =>
  Object.freeze(
    definitions.reduce<Record<string, ProtocolProfile>>((acc, definition) => {
      const profile = parseProtocolProfile(definition)
      if (acc[profile.name]) {
        throw new Error(
          `Protocol profile "${profile.name}" is defined twice. A name identifies exactly one total definition.`
        )
      }
      acc[profile.name] = profile
      return acc
    }, {})
  )

/**
 * Name → total definition.
 *
 * ⚠️ **Built at module load, and a bad definition crashes the process there.**
 * That is louder than failing at mint, and deliberately so: a deployment whose
 * profiles do not parse is a deployment that cannot say what it emits, and it
 * should not be serving.
 */
export const PROTOCOL_PROFILES: Readonly<Record<string, ProtocolProfile>> =
  buildProtocolProfileRegistry(DEFINITIONS)

/** Every registered profile name, sorted, for pickers and error messages. */
export const protocolProfileNames = (
  registry: Readonly<Record<string, ProtocolProfile>> = PROTOCOL_PROFILES
): string[] => Object.keys(registry).sort()

/**
 * Look a profile up by name, throwing if it is not registered.
 *
 * ⚠️ **No fallback to a default.** A caller that named a profile meant that
 * profile; quietly serving a different one is how a run reports the wrong
 * answer, and this whole surface exists to stop exactly that.
 */
export const getProtocolProfile = (
  name: string,
  registry: Readonly<Record<string, ProtocolProfile>> = PROTOCOL_PROFILES
): ProtocolProfile => {
  const profile = registry[name]
  if (!profile) {
    const known = protocolProfileNames(registry)
    throw new Error(
      `Unknown protocol profile "${name}". Registered profiles: ${
        known.length ? known.join(', ') : '(none)'
      }.`
    )
  }
  return profile
}
