/**
 * The golden capture set for the protocol profile migration.
 *
 * ## What a golden is here, and what it is for
 *
 * A golden is **the bytes this service put on the wire for one construction**,
 * captured through the routes that serve them, recorded before any profile was
 * wired, and committed. The profile-driven path then has to reproduce it
 * exactly.
 *
 * ⚠️ **The order is the whole value.** These fixtures were captured from source
 * that had no profile wiring in it at all. A golden captured after wiring is a
 * record of what the new code does, not a check on it — which is the defect
 * class this service keeps finding: a test that encodes our own assumption as
 * intent.
 *
 * ⚠️ **There is deliberately no regeneration path in the repository.** If a
 * golden disagrees with what the service emits, **the bytes moved**, and the
 * finding is the diff — not a stale fixture to be refreshed. Making them
 * regenerable would put a button on the wall labelled "erase the evidence".
 * Capturing a genuinely new construction is a new fixture file, written
 * alongside the arm that emits it.
 *
 * ## Why the bytes are normalised, and exactly which ones
 *
 * Four values differ on every mint — the exchange id, the challenge (which is
 * also the OID4VP `nonce`), the OID4VP `state`, and the OID4VCI pre-authorized
 * code. They are replaced by stable tokens **and by nothing else**: every other
 * byte is compared literally, including punctuation, ordering and encoding.
 *
 * The substitution is on the serialized text rather than on known fields, so a
 * value that leaks into a place nobody expected — a query string, a URL path, a
 * nested object — is still normalised, and a value that is NOT one of the four
 * cannot be quietly waved through.
 */
import { app } from '../hono.js'
import { getExchangeData } from '../transactionManager.js'
import { DOUBLE_TENANT_NAME } from './signing-service-double.js'

/**
 * The tenant the conformant arm mints against — one with an entity identity.
 *
 * ⚠️ A fixture tenant, injected by the test file, never a row out of `.env`.
 * The signed arm's `client_id` IS the entity DID, so a golden minted against a
 * developer's own tenant would carry that developer's hostname in its bytes.
 */
export const GOLDEN_ENTITY_TENANT = DOUBLE_TENANT_NAME

/** Host every golden is minted against, so no golden carries a local path. */
export const GOLDEN_EXCHANGE_HOST = 'http://localhost:4005'

/** The claim template used by every claim golden. */
const GOLDEN_VC = JSON.stringify({
  '@context': [
    'https://www.w3.org/2018/credentials/v1',
    'https://purl.imsglobal.org/spec/ob/v3p0/context.json'
  ],
  type: ['VerifiableCredential', 'OpenBadgeCredential'],
  credentialSubject: { type: ['AchievementSubject'] }
})

/** The claims used by every PEX golden — `limit_disclosure` needs fields. */
const GOLDEN_CLAIMS = [
  { path: ['credentialSubject', 'achievement', 'name'], values: ['Welding'] }
]

const VERIFY_BASE = {
  vprContext: ['https://www.w3.org/2018/credentials/v1'],
  vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
  trustedIssuers: [],
  vprClaims: []
}

/**
 * One construction to pin.
 *
 * `variables` is what a caller posts. ⚠️ These are the eleven knobs as they
 * stand today: the migration must keep them producing exactly these bytes, so
 * the cases are written in the caller's vocabulary rather than in profiles'.
 */
export interface GoldenCase {
  /** Fixture basename, and the name reported in the coverage table. */
  name: string
  workflow: 'claim' | 'didAuth' | 'verify'
  /**
   * Tenant this case mints against. Defaults to `default`.
   *
   * ⚠️ It is a field because the `decentralized_identifier` arm's `client_id`
   * is the tenant's **entity identity**, so that case cannot mint against a
   * tenant that has none. The test file supplies a fixture tenant rather than
   * reading one out of a developer's `.env` — a golden whose bytes depend on
   * whose machine ran it is not a golden.
   */
  tenantName?: string
  variables: Record<string, unknown>
  /** One line on why this construction is pinned. */
  why: string
  /**
   * ⚠️ True when this construction's bytes have actually been sent to a live
   * wallet. Those bytes are a fixed reference point: change them and a record
   * written before the change and one written after it are not comparable, so
   * they must not change casually.
   */
  exercisedOnTheWire: boolean
  /**
   * The profile that must reproduce this construction with **no knob set at
   * all** — the second half of the golden run, and the one that proves the
   * profile surface can carry the service rather than merely sit beside it.
   */
  profile: string
  /**
   * ⚠️ True when **no knob can reach this construction** — it exists only as a
   * profile.
   *
   * Such a case is excluded from the no-profile half of the golden run, and the
   * exclusion is the honest encoding rather than a convenience: with no profile
   * configured the service emits a *different* construction, so asserting the
   * fixture there would be asserting that two different constructions are the
   * same. It also means this case has no pre-change capture to be checked
   * against — there was nothing to capture.
   */
  profileOnly?: boolean
}

/**
 * The per-exchange knobs a profile replaces.
 *
 * ⚠️ Stripped for the profile-driven half of the golden run. Leaving one in
 * would let the knob answer the question the profile is supposed to answer, and
 * the run would pass without the profile ever being consulted.
 */
export const KNOB_VARIABLES = [
  'oid4vpDelivery',
  'oid4vpQueryLanguage',
  'vprLimitDisclosure'
] as const

/** The same case with every knob removed. */
export const withoutKnobs = (testCase: GoldenCase): GoldenCase => ({
  ...testCase,
  variables: Object.fromEntries(
    Object.entries(testCase.variables).filter(
      ([key]) => !(KNOB_VARIABLES as readonly string[]).includes(key)
    )
  )
})

export const GOLDEN_CASES: GoldenCase[] = [
  {
    name: 'claim-default',
    workflow: 'claim',
    variables: { vc: GOLDEN_VC, retrievalId: 'g1' },
    why: 'The claim envelope and the OID4VCI credential offer, by reference.',
    exercisedOnTheWire: true,
    profile: 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
  },
  {
    name: 'didauth-default',
    workflow: 'didAuth',
    variables: {},
    why: 'The didAuth VPR — three interact services and a bare-host `domain`.',
    exercisedOnTheWire: true,
    profile: 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
  },
  {
    name: 'verify-default',
    workflow: 'verify',
    variables: { ...VERIFY_BASE },
    why: '⚠️ by-reference + dcql. The default construction.',
    exercisedOnTheWire: true,
    profile: 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
  },
  {
    name: 'verify-by-value-dcql',
    workflow: 'verify',
    variables: { ...VERIFY_BASE, oid4vpDelivery: 'by-value' },
    why: 'The by-value arm — the conformant delivery under the redirect_uri prefix, and a baseline construction.',
    exercisedOnTheWire: true,
    profile: 'oid4vp-1.0-by-value-dcql-redirect-uri'
  },
  {
    name: 'verify-by-reference-pex',
    workflow: 'verify',
    variables: {
      ...VERIFY_BASE,
      vprClaims: GOLDEN_CLAIMS,
      oid4vpQueryLanguage: 'pex'
    },
    why: 'The PEX selector, by reference — a baseline construction.',
    exercisedOnTheWire: true,
    profile: 'oid4vp-1.0-json-by-reference-pex-redirect-uri'
  },
  {
    name: 'verify-by-value-pex',
    workflow: 'verify',
    variables: {
      ...VERIFY_BASE,
      vprClaims: GOLDEN_CLAIMS,
      oid4vpQueryLanguage: 'pex',
      oid4vpDelivery: 'by-value'
    },
    why: 'Both non-default axes at once; the pair is not a superposition of the two singles.',
    exercisedOnTheWire: false,
    profile: 'oid4vp-1.0-by-value-pex-redirect-uri'
  },
  {
    name: 'verify-pex-limit-disclosure-required',
    workflow: 'verify',
    variables: {
      ...VERIFY_BASE,
      vprClaims: GOLDEN_CLAIMS,
      oid4vpQueryLanguage: 'pex',
      vprLimitDisclosure: 'required'
    },
    why: 'The selective-disclosure ask, in its strict form.',
    exercisedOnTheWire: false,
    profile: 'oid4vp-1.0-json-by-reference-pex-limit-disclosure-required-redirect-uri'
  },
  {
    name: 'verify-pex-limit-disclosure-preferred',
    workflow: 'verify',
    variables: {
      ...VERIFY_BASE,
      vprClaims: GOLDEN_CLAIMS,
      oid4vpQueryLanguage: 'pex',
      vprLimitDisclosure: 'preferred'
    },
    why: 'The other value is a different emitted byte, not a shade of the same one.',
    exercisedOnTheWire: false,
    profile: 'oid4vp-1.0-json-by-reference-pex-limit-disclosure-preferred-redirect-uri'
  },
  {
    name: 'verify-signed-jwt-conformant',
    workflow: 'verify',
    tenantName: GOLDEN_ENTITY_TENANT,
    variables: { ...VERIFY_BASE },
    why: "⚠️ The conformant arm: a genuinely signed request-object JWT under the `decentralized_identifier` client_id prefix. CONFORMANT and ACCEPTED are separate claims and this fixture speaks only to the first — no wallet has accepted it. Profile-only; no knob can reach it. ⚠️ Like the accommodation and unlike every other golden here, it was captured AFTER the change because the construction did not exist before; `oid4vp/signed-request-object.app.test.ts` is its acceptance and was confirmed failing before the change. ⚠️ The signature segment is produced by a DOUBLE, not by a key — see `test-fixtures/signing-service-double.ts`. It pins the ENVELOPE and the claims, never the cryptography.",
    exercisedOnTheWire: false,
    profile: 'oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier',
    profileOnly: true
  },
  {
    name: 'verify-vpr-bare-origin-domain',
    workflow: 'verify',
    variables: { ...VERIFY_BASE },
    why: 'Single-variable arm: VPR `domain` as a bare origin, off the default; profile-only.',
    exercisedOnTheWire: false,
    profile: 'vcapi-vpr-bare-origin-domain',
    profileOnly: true
  },
  {
    name: 'verify-vpr-no-accepted-cryptosuites',
    workflow: 'verify',
    variables: { ...VERIFY_BASE },
    why: '⚠️ Single-variable arm: `acceptedCryptosuites` omitted from BOTH positions while `acceptedMethods` stays — the pairing some verifiers emit, and the one a bundled field could not express.',
    exercisedOnTheWire: false,
    profile: 'vcapi-vpr-no-accepted-cryptosuites',
    profileOnly: true
  },
  {
    name: 'verify-vpr-bare-origin-domain-no-accepted-cryptosuites',
    workflow: 'verify',
    variables: { ...VERIFY_BASE },
    why: '⚠️ Combined arm: both VPR omissions at once. Not a substitute for the singles — a combined run that completes cannot say which change mattered.',
    exercisedOnTheWire: false,
    profile: 'vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites',
    profileOnly: true
  },
  {
    name: 'verify-with-claims-dcql',
    workflow: 'verify',
    variables: { ...VERIFY_BASE, vprClaims: GOLDEN_CLAIMS },
    why: 'DCQL with a claims constraint — the arm where `claims` is present rather than omitted.',
    exercisedOnTheWire: true,
    profile: 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
  }
]

/** What one golden holds. Field order is the file's order; it is compared as data, not as text. */
export interface GoldenCapture {
  name: string
  workflow: string
  why: string
  exercisedOnTheWire: boolean
  variables: Record<string, unknown>
  /** The create response — the whole protocols envelope. */
  protocols: unknown
  /** The served authorization request JSON; absent on the by-value arm, which has no GET. */
  oid4vpRequest?: unknown
  /** The served credential offer JSON; claim only. */
  credentialOffer?: unknown
}

const replaceAll = (text: string, from: string, to: string): string =>
  from ? text.split(from).join(to) : text

/**
 * Replace the four per-mint identifiers with stable tokens, on the serialized
 * text so nothing escapes by hiding in a URL.
 */
const normalise = <T>(
  value: T,
  ids: {
    exchangeId: string
    challenge?: string
    state?: string
    preAuthorizedCode?: string
  }
): T => {
  let text = JSON.stringify(value)
  text = replaceAll(text, ids.exchangeId, '{exchangeId}')
  if (ids.challenge) text = replaceAll(text, ids.challenge, '{challenge}')
  if (ids.state) text = replaceAll(text, ids.state, '{state}')
  if (ids.preAuthorizedCode) {
    text = replaceAll(text, ids.preAuthorizedCode, '{preAuthorizedCode}')
  }
  // The by-value deep link percent-encodes its parameters, so a raw id also
  // appears in encoded form. Encoding these four is lossless — they are
  // base64url, hex or a UUID — but doing it after the raw pass means an
  // identifier that needed encoding is still caught.
  for (const [raw, token] of [
    [ids.exchangeId, '{exchangeId}'],
    [ids.challenge, '{challenge}'],
    [ids.state, '{state}'],
    [ids.preAuthorizedCode, '{preAuthorizedCode}']
  ] as const) {
    if (raw) text = replaceAll(text, encodeURIComponent(raw), token)
  }
  return JSON.parse(text) as T
}

/** Pull the exchangeId out of the `vcapi` service endpoint URL. */
const exchangeIdFrom = (protocols: { vcapi: string }): string =>
  new URL(protocols.vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]!

/**
 * Mint one case through the routes and capture every byte it serves.
 *
 * ⚠️ Through the ROUTES, never by calling a builder. The builder's return value
 * is our own intent; what a wallet receives is what the route serialized, and
 * the two have differed before.
 */
export const captureGolden = async (
  testCase: GoldenCase
): Promise<GoldenCapture> => {
  const createResponse = await app.request(
    `/workflows/${testCase.workflow}/exchanges`,
    {
      method: 'POST',
      body: JSON.stringify({
        variables: {
          exchangeHost: GOLDEN_EXCHANGE_HOST,
          tenantName: testCase.tenantName ?? 'default',
          ...testCase.variables
        }
      }),
      headers: { 'Content-Type': 'application/json' }
    }
  )
  if (createResponse.status !== 200) {
    throw new Error(
      `Golden "${testCase.name}": create returned ${createResponse.status}, not 200.`
    )
  }
  const protocols = (await createResponse.json()) as {
    vcapi: string
    OID4VP?: string
  }
  const exchangeId = exchangeIdFrom(protocols)

  // ⚠️ Which delivery this exchange elected is read off the WIRE — a deep link
  // carrying `request_uri=` is by reference — not off the variables that were
  // posted. The profile-driven half of the golden run posts no delivery knob at
  // all, so asking the input would fetch a `request_uri` on an arm that issues
  // no GET, and the capture would record a request the wallet never sees.
  let oid4vpRequest: unknown
  if (
    testCase.workflow === 'verify' &&
    typeof protocols.OID4VP === 'string' &&
    protocols.OID4VP.includes('request_uri=')
  ) {
    const requestResponse = await app.request(
      `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
    )
    if (requestResponse.status !== 200) {
      throw new Error(
        `Golden "${testCase.name}": request_uri returned ${requestResponse.status}, not 200.`
      )
    }
    // ⚠️ Read as TEXT, because a signed request-object arm answers
    // `application/oauth-authz-req+jwt` and calling `.json()` on a JWT throws.
    //
    // ⚠️ **A JSON arm is captured exactly as it always was — the parsed body,
    // nothing around it.** Enriching its shape would mean rewriting every
    // fixture captured before any profile wiring existed, which is
    // regenerating the pre-change record: the one thing these goldens exist to
    // make impossible. The envelope is recorded only for the arm whose
    // envelope is the point.
    const contentType = requestResponse.headers.get('content-type') ?? ''
    const raw = await requestResponse.text()
    oid4vpRequest = contentType.includes('json')
      ? (JSON.parse(raw) as unknown)
      : {
          contentType,
          jwtSegments: raw.split('.').length,
          signatureSegmentEmpty: raw.split('.')[2] === '',
          header: JSON.parse(
            Buffer.from(raw.split('.')[0] ?? '', 'base64url').toString('utf8')
          ) as unknown,
          payload: JSON.parse(
            Buffer.from(raw.split('.')[1] ?? '', 'base64url').toString('utf8')
          ) as unknown
        }
  }

  let credentialOffer: unknown
  if (testCase.workflow === 'claim') {
    const offerResponse = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
    )
    if (offerResponse.status !== 200) {
      throw new Error(
        `Golden "${testCase.name}": credential-offer returned ${offerResponse.status}, not 200.`
      )
    }
    credentialOffer = await offerResponse.json()
  }

  // Read the record AFTER the fetches above, so lazily minted values (the
  // by-reference `state`, the pre-authorized code) are present to normalise.
  const exchange = (await getExchangeData(
    exchangeId,
    testCase.workflow
  )) as App.ExchangeDetailVerify & {
    variables: { oid4vci?: { preAuthorizedCode?: string } }
  }
  const ids = {
    exchangeId,
    challenge: exchange.variables.challenge,
    state: exchange.variables.oid4vp?.state,
    preAuthorizedCode: exchange.variables.oid4vci?.preAuthorizedCode
  }

  return normalise(
    {
      name: testCase.name,
      workflow: testCase.workflow,
      why: testCase.why,
      exercisedOnTheWire: testCase.exercisedOnTheWire,
      variables: testCase.variables,
      protocols,
      ...(oid4vpRequest ? { oid4vpRequest } : {}),
      ...(credentialOffer ? { credentialOffer } : {})
    },
    ids
  ) as GoldenCapture
}
