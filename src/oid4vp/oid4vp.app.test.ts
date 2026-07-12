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
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import { getExchangeData } from '../transactionManager.js'
import { resetVerifier } from '../lib/verifier.js'
import { createMockVerifierCoreResult } from '../test-fixtures/testData.js'
import { authorizationRequestSchema, VC_TYPE_IRI } from './schemas.js'

const EXCHANGE_HOST = 'http://localhost:4005'

beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    tenantAuthenticationEnabled: false
  }))
})

afterAll(() => {
  vi.restoreAllMocks()
})

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
const verifyVariables = (vprClaims: App.DcqlClaim[] = []) => ({
  vprContext: ['https://www.w3.org/2018/credentials/v1'],
  vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
  trustedIssuers: [],
  vprClaims
})

/** Pull the exchangeId out of the `vcapi` service endpoint URL. */
const exchangeIdFromProtocols = (protocols: Protocols): string =>
  new URL(protocols.vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]

const createVerifyExchange = async (
  vprClaims: App.DcqlClaim[] = []
): Promise<string> =>
  exchangeIdFromProtocols(await createExchange('verify', verifyVariables(vprClaims)))

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
    expect(req.dcql_query.credentials[0].meta.type_values).toEqual([
      [VC_TYPE_IRI]
    ])
    expect(req.dcql_query.credentials[0].claims).toBeUndefined()
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
    expect(req.dcql_query.credentials[0].claims).toEqual([
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
