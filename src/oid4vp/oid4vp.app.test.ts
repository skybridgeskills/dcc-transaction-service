/**
 * Hono integration tests for the OID4VP 1.0 verifier binding.
 *
 * P2 covers the `protocols.OID4VP` deep link and the `request_uri`
 * authorization-request route. P3 extends this file with the
 * `direct_post` `response_uri` handler (positive + negative cases).
 */
import {
  describe,
  expect,
  test,
  beforeAll,
  afterAll,
  afterEach,
  vi
} from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import { getExchangeData } from '../transactionManager.js'
import { resetVerifier } from '../lib/verifier.js'
import { createMockVerifierCoreResult } from '../test-fixtures/testData.js'
import { flushJournal, type JournalEntry } from '../journal/index.js'
import { authorizationRequestSchema, VC_TYPE_IRI } from './schemas.js'

/**
 * Narrow an authorization request to its DCQL arm.
 *
 * `dcql_query` became optional when the PEX arm was added — exactly one of
 * the two is present. Assert the arm the test expects rather than reaching
 * through with `!`, so a request that silently switched language fails here
 * with a clear message instead of a null dereference.
 */
const dcqlOf = (req: { dcql_query?: unknown }) => {
  if (!req.dcql_query) {
    throw new Error('expected a dcql_query arm on the authorization request')
  }
  return req.dcql_query as {
    credentials: [
      { meta: { type_values: string[][] }; claims?: unknown; format: string }
    ]
  }
}


const EXCHANGE_HOST = 'http://localhost:4005'

/**
 * The journal is enabled for this file so the wallet-error tests can assert
 * what was recorded. A wallet's own diagnosis is the whole value of accepting
 * its error response, and it is written nowhere else.
 */
let journalDirectory: string
let journalPath: string

beforeAll(async () => {
  journalDirectory = await mkdtemp(join(tmpdir(), 'oid4vp-app-'))
  journalPath = join(journalDirectory, 'journal.jsonl')
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    tenantAuthenticationEnabled: false,
    exchangeJournalPath: journalPath
  }))
})

afterAll(async () => {
  // Drain first: journal writes are fire-and-forget by design, and an append
  // still in flight will recreate the file underneath the directory removal.
  await flushJournal()
  vi.restoreAllMocks()
  await rm(journalDirectory, { recursive: true, force: true })
})

const linesFor = async (exchangeId: string): Promise<JournalEntry[]> => {
  await flushJournal()
  return (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
    .filter((entry) => entry.exchangeId === exchangeId)
}

type Protocols = {
  vcapi: string
  OID4VP?: string
  OID4VCI?: string
}

/** Create an exchange via the VC-API single-create route; returns its protocols. */
const createExchange = async (
  workflowId: 'verify' | 'didAuth' | 'claim',
  variables: Record<string, unknown> = {}
): Promise<Protocols> => {
  const response = await app.request(`/workflows/${workflowId}/exchanges`, {
    method: 'POST',
    body: JSON.stringify({
      variables: { exchangeHost: EXCHANGE_HOST, tenantName: 'default', ...variables }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  return (await response.json()) as Protocols
}

/** The single verify credential-type config used across these tests. */
const verifyVariables = (
  vprClaims: App.DcqlClaim[] = [],
  oid4vpQueryLanguage?: App.Oid4vpQueryLanguage
) => ({
  vprContext: ['https://www.w3.org/2018/credentials/v1'],
  vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
  trustedIssuers: [],
  vprClaims,
  ...(oid4vpQueryLanguage ? { oid4vpQueryLanguage } : {})
})

/** Pull the exchangeId out of the `vcapi` service endpoint URL. */
const exchangeIdFromProtocols = (protocols: Protocols): string =>
  new URL(protocols.vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]

const createVerifyExchange = async (
  vprClaims: App.DcqlClaim[] = [],
  oid4vpQueryLanguage?: App.Oid4vpQueryLanguage
): Promise<string> =>
  exchangeIdFromProtocols(
    await createExchange(
      'verify',
      verifyVariables(vprClaims, oid4vpQueryLanguage)
    )
  )

describe('OID4VP · protocols field', () => {
  test('verify exchange protocols include an `openid4vp://` OID4VP deep link', async () => {
    const protocols = await createExchange('verify', verifyVariables())
    const exchangeId = exchangeIdFromProtocols(protocols)
    expect(protocols.OID4VP).toBeDefined()
    expect(protocols.OID4VP!.startsWith('openid4vp://')).toBe(true)
    expect(protocols.OID4VP).toContain('client_id=')
    expect(protocols.OID4VP).toContain('request_uri=')
    expect(decodeURIComponent(protocols.OID4VP!)).toContain(
      `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
    )
  })

  test('didAuth exchange does not surface `OID4VP`', async () => {
    const protocols = await createExchange('didAuth')
    expect(protocols.OID4VP).toBeUndefined()
  })
})

describe('OID4VP · GET /openid4vp/request', () => {
  test('returns a spec-valid, no-store authorization request JSON', async () => {
    const exchangeId = await createVerifyExchange()
    const response = await app.request(
      `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('json')
    expect(response.headers.get('cache-control')).toBe('no-store')
    const req = authorizationRequestSchema.parse(await response.json())
    expect(req.client_id).toBe(
      `redirect_uri:${EXCHANGE_HOST}/workflows/verify/exchanges/${exchangeId}/openid4vp/response`
    )
    expect(req.state).toBeTruthy()
    expect(dcqlOf(req).credentials[0].meta.type_values).toEqual([
      [VC_TYPE_IRI]
    ])
    expect(dcqlOf(req).credentials[0].claims).toBeUndefined()
  })

  test('reflects vprClaims in the DCQL claims', async () => {
    const exchangeId = await createVerifyExchange([
      {
        path: ['credentialSubject', 'achievement', 'name'],
        values: ['Introduction to Wonderfullness']
      }
    ])
    const response = await app.request(
      `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
    )
    const req = authorizationRequestSchema.parse(await response.json())
    expect(dcqlOf(req).credentials[0].claims).toEqual([
      {
        path: ['credentialSubject', 'achievement', 'name'],
        values: ['Introduction to Wonderfullness']
      }
    ])
  })

  test('is idempotent: repeated GETs return the same minted state', async () => {
    const exchangeId = await createVerifyExchange()
    const path = `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
    const first = authorizationRequestSchema.parse(
      await (await app.request(path)).json()
    )
    const second = authorizationRequestSchema.parse(
      await (await app.request(path)).json()
    )
    expect(second.state).toBe(first.state)
  })

  test('rejects a non-verify workflow', async () => {
    const protocols = await createExchange('claim', {
      vc: JSON.stringify({
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiableCredential']
      })
    })
    const exchangeId = exchangeIdFromProtocols(protocols)
    const response = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid4vp/request`
    )
    expect(response.status).toBe(400)
  })
})

// --- P3: direct_post response ---------------------------------------------

const responseUri = (exchangeId: string) =>
  `/workflows/verify/exchanges/${exchangeId}/openid4vp/response`

const clientIdFor = (exchangeId: string) =>
  `redirect_uri:${EXCHANGE_HOST}/workflows/verify/exchanges/${exchangeId}/openid4vp/response`

/** A structurally-valid VP that binds `challenge` = nonce and `domain` = client_id. */
const buildBoundVp = (nonce: string, domain: string) => ({
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: 'VerifiablePresentation',
  holder: 'did:key:z6MkholderExample',
  verifiableCredential: {
    '@context': ['https://www.w3.org/2018/credentials/v1'],
    id: 'urn:uuid:oid4vp-test-credential',
    type: ['VerifiableCredential', 'OpenBadgeCredential'],
    issuer: 'did:key:z6MkissuerExample',
    issuanceDate: '2024-01-01T00:00:00Z',
    credentialSubject: { id: 'did:key:z6MkholderExample' },
    proof: {
      type: 'Ed25519Signature2020',
      created: '2024-01-01T00:00:00Z',
      verificationMethod: 'did:key:z6MkissuerExample#z6MkissuerExample',
      proofPurpose: 'assertionMethod',
      proofValue: 'zFakeCredentialProof'
    }
  },
  proof: {
    type: 'DataIntegrityProof',
    cryptosuite: 'eddsa-rdfc-2022',
    created: '2024-01-01T00:00:00Z',
    verificationMethod: 'did:key:z6MkholderExample#z6MkholderExample',
    proofPurpose: 'authentication',
    proofValue: 'zFakePresentationProof',
    challenge: nonce,
    domain
  }
})

/** GET the authorization request to mint + read the exchange's `state` and `nonce`. */
const primeRequest = async (
  exchangeId: string
): Promise<{ state: string; nonce: string }> => {
  const req = authorizationRequestSchema.parse(
    await (
      await app.request(
        `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
      )
    ).json()
  )
  return { state: req.state!, nonce: req.nonce }
}

const postJson = (exchangeId: string, payload: unknown) =>
  app.request(responseUri(exchangeId), {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json' }
  })

describe('OID4VP · POST /openid4vp/response (direct_post)', () => {
  // Inject a fake verifier so the pipeline finalizes without real crypto;
  // structural validation + binding checks still run against the real VP.
  afterEach(() => resetVerifier(undefined))

  test('accepts a bound DCQL vp_token and finalizes the exchange', async () => {
    resetVerifier({
      verifyPresentation: async () => createMockVerifierCoreResult(true, true),
      verifyCredential: async () => {
        throw new Error('not used')
      }
    })
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const vp = buildBoundVp(nonce, clientIdFor(exchangeId))

    const response = await postJson(exchangeId, {
      vp_token: { credential: [vp] },
      state
    })
    expect(response.status).toBe(200)

    const finalized = (await getExchangeData(
      exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(finalized.state).toBe('complete')
    expect(finalized.variables.results?.default).toBeDefined()
    expect(finalized.variables.oid4vp?.responseReceived).toBe(true)
  })

  test('accepts a form-urlencoded vp_token (JSON-string field)', async () => {
    resetVerifier({
      verifyPresentation: async () => createMockVerifierCoreResult(true, true),
      verifyCredential: async () => {
        throw new Error('not used')
      }
    })
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const vp = buildBoundVp(nonce, clientIdFor(exchangeId))

    const form = new URLSearchParams()
    form.set('vp_token', JSON.stringify({ credential: [vp] }))
    form.set('state', state)
    const response = await app.request(responseUri(exchangeId), {
      method: 'POST',
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })
    expect(response.status).toBe(200)
    const finalized = (await getExchangeData(
      exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(finalized.state).toBe('complete')
  })

  test('rejects a mismatched state (invalid_request)', async () => {
    const exchangeId = await createVerifyExchange()
    const { nonce } = await primeRequest(exchangeId)
    const vp = buildBoundVp(nonce, clientIdFor(exchangeId))
    const response = await postJson(exchangeId, {
      vp_token: { credential: [vp] },
      state: 'not-the-issued-state'
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('invalid_request')
  })

  test('rejects a domain mismatch (invalid_presentation)', async () => {
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const vp = buildBoundVp(nonce, 'redirect_uri:https://attacker.example/x')
    const response = await postJson(exchangeId, {
      vp_token: { credential: [vp] },
      state
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('invalid_presentation')
  })

  test('rejects a malformed vp_token (invalid_request)', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: 'not-a-dcql-object',
      state
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error: string }
    expect(body.error).toBe('invalid_request')
  })

  test('rejects a replayed response after the exchange completes', async () => {
    resetVerifier({
      verifyPresentation: async () => createMockVerifierCoreResult(true, true),
      verifyCredential: async () => {
        throw new Error('not used')
      }
    })
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const vp = buildBoundVp(nonce, clientIdFor(exchangeId))
    const payload = { vp_token: { credential: [vp] }, state }

    const first = await postJson(exchangeId, payload)
    expect(first.status).toBe(200)

    const replay = await postJson(exchangeId, payload)
    expect(replay.status).toBe(400)
    const body = (await replay.json()) as { error: string }
    expect(body.error).toBe('invalid_request')
  })
})

describe('OID4VP · direct_post in Presentation Exchange', () => {
  afterEach(() => resetVerifier(undefined))

  const submission = (path: string) => ({
    id: 'sub-1',
    definition_id: 'presentation',
    descriptor_map: [
      {
        id: 'credential',
        format: 'ldp_vp',
        path,
        path_nested: {
          id: 'credential',
          format: 'ldp_vc',
          path: '$.verifiableCredential'
        }
      }
    ]
  })

  const acceptingVerifier = () =>
    resetVerifier({
      verifyPresentation: async () => createMockVerifierCoreResult(true, true),
      verifyCredential: async () => {
        throw new Error('not used')
      }
    })

  test('accepts a PEX vp_token with a presentation_submission', async () => {
    acceptingVerifier()
    const exchangeId = await createVerifyExchange([], 'pex')
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: buildBoundVp(nonce, clientIdFor(exchangeId)),
      presentation_submission: submission('$'),
      state
    })
    expect(response.status).toBe(200)
  })

  test('resolves a descriptor_map path into an array-shaped vp_token', async () => {
    acceptingVerifier()
    const exchangeId = await createVerifyExchange([], 'pex')
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: [buildBoundVp(nonce, clientIdFor(exchangeId))],
      presentation_submission: submission('$[0]'),
      state
    })
    expect(response.status).toBe(200)
  })

  test('rejects a DCQL-shaped response to a PEX exchange', async () => {
    // The discriminator: the exchange knows which language it asked in, so a
    // mismatched response is a failure rather than something to rescue by
    // sniffing the payload shape.
    acceptingVerifier()
    const exchangeId = await createVerifyExchange([], 'pex')
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: { credential: [buildBoundVp(nonce, clientIdFor(exchangeId))] },
      state
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error_description: string }
    expect(body.error_description).toContain('Presentation Exchange')
  })

  test('rejects a PEX-shaped response to a DCQL exchange', async () => {
    acceptingVerifier()
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: buildBoundVp(nonce, clientIdFor(exchangeId)),
      presentation_submission: submission('$'),
      state
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error_description: string }
    expect(body.error_description).toContain('DCQL')
  })

  test('reports an unresolvable descriptor_map path verbatim', async () => {
    acceptingVerifier()
    const exchangeId = await createVerifyExchange([], 'pex')
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: buildBoundVp(nonce, clientIdFor(exchangeId)),
      presentation_submission: submission('$.nope[3]'),
      state
    })
    expect(response.status).toBe(400)
    const body = (await response.json()) as { error_description: string }
    expect(body.error_description).toContain('$.nope[3]')
  })
})

describe('OID4VP · a conformant wallet error response', () => {
  // The defect: a wallet that correctly reported its own failure received a
  // `400 invalid_request` from us, because its body did not parse as a
  // presentation response — so its diagnosis was lost and the record showed
  // only that something at this endpoint had gone wrong. That was our
  // non-conformance, and this is the one place in this build where wire
  // behaviour changes to make something visible.
  test('accepts it with 200, and not with our invalid_request body', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    const response = await postJson(exchangeId, {
      error: 'access_denied',
      error_description: 'no credential matched the request',
      state
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({})
    expect(response.headers.get('cache-control')).toBe('no-store')
  })

  test('terminates the exchange rather than leaving it open', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)
    await postJson(exchangeId, { error: 'access_denied', state })

    const finalized = (await getExchangeData(
      exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    expect(finalized.state).toBe('invalid')
    expect(finalized.variables.oid4vp?.responseReceived).toBe(true)
  })

  test('journals the wallet’s own words verbatim', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)
    await postJson(exchangeId, {
      error: 'access_denied',
      error_description: 'no credential matched the request',
      state
    })

    const [walletError] = (await linesFor(exchangeId)).filter(
      (entry) => entry.event === 'error'
    )
    expect(walletError!.detail).toEqual({
      stage: 'oid4vp-direct-post',
      reason: 'wallet-reported-error',
      error: 'access_denied',
      error_description: 'no credential matched the request'
    })
    // The distinction the state cannot carry: `invalid` says the exchange
    // failed, the journal says the wallet is the one that said so.
    expect((await linesFor(exchangeId)).map((e) => e.event)).toContain(
      'terminal'
    )
  })

  test('accepts an error code from outside our own vocabulary', async () => {
    // `error` is deliberately not narrowed to the codes we emit: the codes a
    // wallet may send are OAuth's plus OID4VP's plus its own profile's, and
    // the report we did not anticipate is the one worth having.
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    const response = await postJson(exchangeId, {
      error: 'vendor_specific_wallet_failure',
      state
    })
    expect(response.status).toBe(200)

    const [walletError] = (await linesFor(exchangeId)).filter(
      (entry) => entry.event === 'error'
    )
    expect(walletError!.detail).toMatchObject({
      error: 'vendor_specific_wallet_failure'
    })
  })

  test('accepts a form-urlencoded error response', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    const form = new URLSearchParams()
    form.set('error', 'access_denied')
    form.set('error_description', 'user cancelled')
    form.set('state', state)
    const response = await app.request(responseUri(exchangeId), {
      method: 'POST',
      body: form.toString(),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    })

    expect(response.status).toBe(200)
    const finalized = await getExchangeData(exchangeId, 'verify')
    expect(finalized.state).toBe('invalid')
  })

  test('is bound by the same state guard as a presentation', async () => {
    // An unbound error report is no more admissible than an unbound
    // presentation — anyone who knows the exchange id could otherwise
    // terminate someone else's exchange.
    const exchangeId = await createVerifyExchange()
    await primeRequest(exchangeId)

    const response = await postJson(exchangeId, {
      error: 'access_denied',
      state: 'not-the-issued-state'
    })
    expect(response.status).toBe(400)
    expect((await response.json()) as { error: string }).toMatchObject({
      error: 'invalid_request'
    })
    expect((await getExchangeData(exchangeId, 'verify')).state).not.toBe(
      'invalid'
    )
  })

  test('a body carrying both `error` and `vp_token` is neither message', async () => {
    // The rule at the top of `handleOid4vpResponse` still holds: this must not
    // become a shape-sniffing fallback that rescues a malformed presentation
    // response by finding an `error` member somewhere in it.
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    const response = await postJson(exchangeId, {
      error: 'access_denied',
      vp_token: 'not-a-dcql-object',
      state
    })
    expect(response.status).toBe(400)
    expect((await response.json()) as { error: string }).toMatchObject({
      error: 'invalid_request'
    })
  })

  test('a malformed body with no `error` still gets the existing 400', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    const response = await postJson(exchangeId, { nonsense: true, state })
    expect(response.status).toBe(400)
    expect((await response.json()) as { error: string }).toMatchObject({
      error: 'invalid_request'
    })
  })
})

describe('OID4VP · our own rejections are journalled as ours', () => {
  // The defect this block pins down: `acceptWalletError` journalled the
  // wallet's account of its failure, and every rejection of OURS journalled
  // nothing — so an exchange we ended left a record containing only the
  // wallet's words. When a client reports an error and then sends a valid VP
  // that WE turn down, the record shows the client's error and a terminal
  // `invalid` and nothing else. A reader with no other source would take that
  // as the exact inverse of what happened.
  //
  // These tests assert the journal, not the wire: the 400s were always right.
  afterEach(() => resetVerifier(undefined))

  const acceptingVerifier = () =>
    resetVerifier({
      verifyPresentation: async () => createMockVerifierCoreResult(true, true),
      verifyCredential: async () => {
        throw new Error('not used')
      }
    })

  const submission = (path: string) => ({
    id: 'sub-1',
    definition_id: 'presentation',
    descriptor_map: [{ id: 'credential', format: 'ldp_vp', path }]
  })

  const errorLines = async (exchangeId: string) =>
    (await linesFor(exchangeId)).filter((entry) => entry.event === 'error')

  test('an audience-binding rejection names us, not the wallet', async () => {
    // The observed shape: a wallet sends a presentation and we reject it.
    // Before the fix this exchange journalled `mint` and `terminal` and
    // nothing in between — no trace that a rejection had happened at all, let
    // alone ours.
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: {
        credential: [buildBoundVp(nonce, 'redirect_uri:https://attacker.example/x')]
      },
      state
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      stage: 'oid4vp-direct-post',
      reason: 'audience-binding-failed',
      error: 'invalid_presentation'
    })
    // Our account of what failed, in our own words — the field a rater reads.
    expect(rejection!.detail!.error_description).toContain('client_id')
  })

  test('a wallet error and a rejection of ours are told apart by `reason`', async () => {
    // Both are `event: error` at `stage: oid4vp-direct-post` with the same
    // `error`/`error_description` pair, on purpose: they are read side by
    // side, and `reason` is the whole of what separates whose failure it was.
    const walletExchange = await createVerifyExchange()
    const walletPrimed = await primeRequest(walletExchange)
    await postJson(walletExchange, {
      error: 'access_denied',
      error_description: 'no credential matched the request',
      state: walletPrimed.state
    })

    const ourExchange = await createVerifyExchange()
    const ourPrimed = await primeRequest(ourExchange)
    await postJson(ourExchange, {
      vp_token: {
        credential: [
          buildBoundVp(ourPrimed.nonce, 'redirect_uri:https://attacker.example/x')
        ]
      },
      state: ourPrimed.state
    })

    const [theirs] = await errorLines(walletExchange)
    const [ours] = await errorLines(ourExchange)
    expect(theirs!.detail!.reason).toBe('wallet-reported-error')
    expect(ours!.detail!.reason).toBe('audience-binding-failed')
    expect(theirs!.detail!.stage).toBe(ours!.detail!.stage)
  })

  test('a vp_token carrying no presentation', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: { credential: ['not-a-presentation'] },
      state
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      reason: 'no-presentation-in-vp-token',
      error: 'invalid_presentation'
    })
  })

  test('an unresolvable PEX descriptor_map path', async () => {
    acceptingVerifier()
    const exchangeId = await createVerifyExchange([], 'pex')
    const { state, nonce } = await primeRequest(exchangeId)
    const response = await postJson(exchangeId, {
      vp_token: buildBoundVp(nonce, clientIdFor(exchangeId)),
      presentation_submission: submission('$.nope[3]'),
      state
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      reason: 'presentation-path-unresolved'
    })
    // The path we could not resolve, kept in the journal and not only on the
    // wire — the wire response is gone the moment the wallet drops it.
    expect(rejection!.detail!.error_description).toContain('$.nope[3]')
  })

  test('a rejection from inside the verify pipeline', async () => {
    // A VP with no `holder` clears the binding checks and is refused by
    // `preparePresentationForVerify`. This is the arm most likely to fire in a
    // real run, and the one whose cause lives furthest from this handler.
    acceptingVerifier()
    const exchangeId = await createVerifyExchange()
    const { state, nonce } = await primeRequest(exchangeId)
    const { holder: _holder, ...holderless } = buildBoundVp(
      nonce,
      clientIdFor(exchangeId)
    )
    const response = await postJson(exchangeId, {
      vp_token: { credential: [holderless] },
      state
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      reason: 'presentation-verification-failed',
      error: 'invalid_presentation'
    })
    // The pipeline's own account, carried out to the journal rather than lost
    // with the HTTPException.
    expect(rejection!.detail!.error_description).toBeTruthy()
  })
})

describe('OID4VP · invalid_request rejections are journalled too', () => {
  // The hole `rejectPresentation` left behind. These three sites returned a
  // 400 and journalled nothing, so an exchange that died here left `mint` and
  // nothing else — not an inversion like the case above, but a silence: the
  // reader is not misled, they are given nothing to read.
  //
  // It lands hardest on the wallet with the thinnest evidence. A wire-only
  // wallet with neither wire nor log fails earlier than the others, and
  // failing early is exactly how you land on one of these. For that wallet
  // the journal is the only channel, so "no line" is the whole record.
  //
  // The wire is unchanged throughout — same code, same description. Every
  // assertion below is about the journal.
  const errorLines = async (exchangeId: string) =>
    (await linesFor(exchangeId)).filter((entry) => entry.event === 'error')

  test('a malformed direct_post body names the body, and claims no message type', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    const response = await postJson(exchangeId, { nonsense: true, state })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      stage: 'oid4vp-direct-post',
      reason: 'malformed-direct-post-body',
      error: 'invalid_request'
    })
    // The body did not parse, so which message it was MEANT to be is not
    // known. Guessing it would be inventing evidence.
    expect(rejection!.detail).not.toHaveProperty('guarding')
  })

  test('an unbound presentation is journalled as a state mismatch, against the presentation', async () => {
    const exchangeId = await createVerifyExchange()
    const { nonce } = await primeRequest(exchangeId)

    const response = await postJson(exchangeId, {
      vp_token: { credential: [buildBoundVp(nonce, clientIdFor(exchangeId))] },
      state: 'not-the-issued-state'
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      stage: 'oid4vp-direct-post',
      reason: 'state-mismatch',
      error: 'invalid_request',
      guarding: 'presentation'
    })
  })

  test('an unbound WALLET ERROR REPORT is journalled — the case that vanished entirely', async () => {
    // This guard runs BEFORE the wallet-error line is written, so before the
    // fix an unbound or replayed error report left no trace at all. It is
    // also the one event on this path that could have come from someone other
    // than the wallet, which is why its absence was the worst of the three.
    const exchangeId = await createVerifyExchange()
    await primeRequest(exchangeId)

    const response = await postJson(exchangeId, {
      error: 'access_denied',
      error_description: 'no credential matched the request',
      state: 'not-the-issued-state'
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      stage: 'oid4vp-direct-post',
      reason: 'state-mismatch',
      error: 'invalid_request',
      guarding: 'wallet-error-report'
    })
    // And emphatically NOT recorded as the wallet's own account: nothing the
    // wallet said here was ever bound to this exchange.
    expect(rejection!.detail!.reason).not.toBe('wallet-reported-error')
  })

  test('a replayed response is journalled as a replay, not as a mismatch', async () => {
    const exchangeId = await createVerifyExchange()
    const { state } = await primeRequest(exchangeId)

    // First response is accepted and terminates the exchange.
    await postJson(exchangeId, {
      error: 'access_denied',
      error_description: 'no credential matched the request',
      state
    })
    // Same state, replayed.
    const replay = await postJson(exchangeId, {
      error: 'access_denied',
      error_description: 'no credential matched the request',
      state
    })
    expect(replay.status).toBe(400)

    const reasons = (await errorLines(exchangeId)).map((e) => e.detail!.reason)
    // Both lines survive, and they are distinguishable: the wallet's account
    // of the first, our refusal of the second.
    expect(reasons).toContain('wallet-reported-error')
    expect(reasons).toContain('response-already-accepted')
  })

  test('a response to an exchange that never issued a request says so', async () => {
    // No primeRequest: nothing was ever asked of this wallet.
    const exchangeId = await createVerifyExchange()

    const response = await postJson(exchangeId, {
      error: 'access_denied',
      state: 'anything'
    })
    expect(response.status).toBe(400)

    const [rejection] = await errorLines(exchangeId)
    expect(rejection!.detail).toMatchObject({
      stage: 'oid4vp-direct-post',
      reason: 'no-request-issued',
      error: 'invalid_request'
    })
  })
})
