/**
 * Wire tests for the conformant signed by-reference arm.
 *
 * ⚠️ **CONFORMANT AND ACCEPTED ARE DIFFERENT CLAIMS, and these tests establish
 * only the first — on our side of the wire.** Nothing here is evidence that any
 * wallet accepts an EdDSA-signed request object; ES256 is the mDL/EUDI default
 * and a wallet declares what it takes via
 * `request_object_signing_alg_values_supported`. A green suite here means the
 * service serves a conformant construction, not that the construction works.
 *
 * Everything reads the **served bytes** through the route. A builder's return
 * value is our own intent, and the parse between it and the wire has silently
 * dropped fields before.
 *
 * ⚠️ The signing service is a double (`test-fixtures/signing-service-double.ts`)
 * and does not sign. The real signature is tested where the real key is; read
 * that file before treating anything here as cryptographic evidence.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, test, vi } from 'vitest'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import {
  DOUBLE_ENTITY_DID,
  DOUBLE_SIGNING_TENANT,
  DOUBLE_TENANT_NAME,
  doubleDidDocument,
  doubleSignRequestObject,
  doubleTenant
} from '../test-fixtures/signing-service-double.js'

const EXCHANGE_HOST = 'http://localhost:4005'
const SIGNING_SERVICE = 'http://signing.test:4006'

const SIGNED_PROFILE =
  'oid4vp-1.0-jwt-signed-by-reference-dcql-decentralized-identifier'
const JSON_PROFILE = 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'

const SIGN_URL = `${SIGNING_SERVICE}/instance/${DOUBLE_SIGNING_TENANT}/openid4vp/request-object/sign`

let activeProfileName: string | undefined
/** What the signing-service double does on the next call. */
let signingBehaviour: 'sign' | 'unreachable' | 'refuse' | 'unsigned-body' =
  'sign'
/** Every request-object signing call the service made, in order. */
let signingCalls: Array<{ url: string; body: unknown }> = []

beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(
    (url: string, body?: unknown): Promise<{ data: unknown }> => {
      if (!url.includes('/openid4vp/request-object/sign')) {
        return Promise.resolve({ data: {} })
      }
      signingCalls.push({ url, body })
      if (signingBehaviour === 'unreachable') {
        return Promise.reject(
          Object.assign(new Error('connect ECONNREFUSED'), {
            code: 'ECONNREFUSED'
          })
        )
      }
      if (signingBehaviour === 'refuse') {
        // A 400 with problem details — the shape `upstream-call.ts` forwards to
        // the caller on other upstream calls, and must NOT forward here.
        return Promise.reject(
          Object.assign(new Error('Request failed with status code 400'), {
            isAxiosError: true,
            response: {
              status: 400,
              statusText: 'Bad Request',
              data: {
                message: 'A request object must be provided in the body.',
                problemDetails: [{ title: 'nope' }]
              }
            }
          })
        )
      }
      if (signingBehaviour === 'unsigned-body') {
        // ⚠️ A 200 carrying the accommodation's shape: three segments, third
        // empty. The failure this arm must never mistake for success.
        const [header, payload] = doubleSignRequestObject(body).split('.')
        return Promise.resolve({ data: `${header}.${payload}.` })
      }
      return Promise.resolve({ data: doubleSignRequestObject(body) })
    }
  )
  vi.spyOn(axios, 'get').mockImplementation((url: string) =>
    url.includes(`/instance/${DOUBLE_SIGNING_TENANT}/did.json`)
      ? Promise.resolve({ data: doubleDidDocument() })
      : Promise.reject(new Error(`unexpected GET ${url}`))
  )
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    signingService: SIGNING_SERVICE,
    tenantAuthenticationEnabled: false,
    tenants: { ...cur.tenants, [DOUBLE_TENANT_NAME]: doubleTenant() },
    ...(activeProfileName
      ? { defaultProtocolProfileName: activeProfileName }
      : {})
  }))
})

afterAll(() => {
  activeProfileName = undefined
  vi.restoreAllMocks()
})

const createVerifyExchange = async (
  tenantName = DOUBLE_TENANT_NAME
): Promise<string> => {
  const response = await app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: EXCHANGE_HOST,
        tenantName,
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
        trustedIssuers: [],
        vprClaims: []
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const protocols = (await response.json()) as { vcapi: string }
  return new URL(protocols.vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]!
}

const fetchRequest = async (
  profile: string,
  tenantName = DOUBLE_TENANT_NAME
): Promise<Response> => {
  activeProfileName = profile
  const exchangeId = await createVerifyExchange(tenantName)
  return app.request(
    `/workflows/verify/exchanges/${exchangeId}/openid4vp/request`
  )
}

const createProtocols = async (
  profile: string,
  tenantName = DOUBLE_TENANT_NAME
): Promise<Record<string, string>> => {
  activeProfileName = profile
  const response = await app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: EXCHANGE_HOST,
        tenantName,
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
        trustedIssuers: [],
        vprClaims: []
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, string>
}

const decodeSegment = (segment: string): unknown =>
  JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown

beforeEach(() => {
  signingBehaviour = 'sign'
  signingCalls = []
})

describe('the conformant signed arm — what goes on the wire', () => {
  test('the request_uri response is a three-part JWS with a NON-EMPTY signature', async () => {
    const response = await fetchRequest(SIGNED_PROFILE)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain(
      'application/oauth-authz-req+jwt'
    )
    const body = await response.text()
    const segments = body.split('.')
    expect(segments).toHaveLength(3)
    // ⚠️ Asserted EXPLICITLY, and this is the assertion that separates this arm
    // from the accommodation. `alg: none` is three-part with an EMPTY third
    // segment; a signed object that lost its signature would still be
    // three-part and would still parse. The two must be impossible to confuse.
    expect(segments[2]).not.toBe('')
    expect(segments[2]!.length).toBeGreaterThan(0)
  })

  test('the JOSE header states EdDSA and the request-object type', async () => {
    const response = await fetchRequest(SIGNED_PROFILE)
    const header = decodeSegment((await response.text()).split('.')[0]!) as {
      alg: string
      typ: string
      kid: string
    }
    expect(header.alg).toBe('EdDSA')
    expect(header.typ).toBe('oauth-authz-req+jwt')
    expect(header.alg).not.toBe('none')
  })

  test('the `kid` resolves in the DID document published for this entity', async () => {
    const response = await fetchRequest(SIGNED_PROFILE)
    const header = decodeSegment((await response.text()).split('.')[0]!) as {
      kid: string
    }
    // ⚠️ Compared against the document as SERVED, not against a constant. A
    // constant would keep passing while the published document and the signing
    // key drifted apart — which is gap H1, and the whole reason the signature
    // is produced by the component that publishes the document.
    const published = doubleDidDocument().verificationMethod as Array<{
      id: string
    }>
    expect(header.kid).toBe(published[0]!.id)
    expect(header.kid.startsWith(`${DOUBLE_ENTITY_DID}#`)).toBe(true)
  })

  test('`client_id` carries the decentralized_identifier prefix and the entity DID', async () => {
    const response = await fetchRequest(SIGNED_PROFILE)
    const payload = decodeSegment((await response.text()).split('.')[1]!) as {
      client_id: string
      client_id_scheme?: string
      response_uri: string
      require_signed_request_object?: boolean
    }
    expect(payload.client_id).toBe(
      `decentralized_identifier:${DOUBLE_ENTITY_DID}`
    )
    // The draft-era spelling has no meaning for this prefix and must not appear.
    expect(payload.client_id_scheme).toBeUndefined()
    expect(payload.response_uri).toContain('/openid4vp/response')
  })

  test('`client_metadata.require_signed_request_object` states true, truthfully', async () => {
    const response = await fetchRequest(SIGNED_PROFILE)
    const payload = decodeSegment((await response.text()).split('.')[1]!) as {
      client_metadata: { require_signed_request_object?: boolean }
    }
    expect(payload.client_metadata.require_signed_request_object).toBe(true)
  })

  test('the deep link carries the DID client_id, not the response URI', async () => {
    const protocols = await createProtocols(SIGNED_PROFILE)
    const deepLink = protocols.OID4VP!
    expect(deepLink).toContain(
      `client_id=${encodeURIComponent(`decentralized_identifier:${DOUBLE_ENTITY_DID}`)}`
    )
    expect(deepLink).toContain('request_uri=')
  })

  test('the served bytes are the signing service response VERBATIM', async () => {
    const response = await fetchRequest(SIGNED_PROFILE)
    const body = await response.text()
    expect(signingCalls).toHaveLength(1)
    expect(signingCalls[0]!.url).toBe(SIGN_URL)
    // ⚠️ Re-derived from the claims we sent up. If this service re-serialized,
    // re-ordered or re-encoded anything on the way out, the third segment stops
    // matching — the double's digest is a pure function of the signing input
    // for exactly this reason.
    expect(body).toBe(doubleSignRequestObject(signingCalls[0]!.body))
  })

  test('the claims sent for signing are the request this service built', async () => {
    await fetchRequest(SIGNED_PROFILE)
    const sent = signingCalls[0]!.body as Record<string, unknown>
    expect(sent.response_type).toBe('vp_token')
    expect(sent.client_id).toBe(
      `decentralized_identifier:${DOUBLE_ENTITY_DID}`
    )
    expect(sent.dcql_query).toBeDefined()
  })
})

describe('⚠️ a signing failure is loud and CANNOT become an unsigned response', () => {
  test('an unreachable signing service is a named 502, not a request object', async () => {
    signingBehaviour = 'unreachable'
    const response = await fetchRequest(SIGNED_PROFILE)
    expect(response.status).toBe(502)
    const body = (await response.json()) as { message: string }
    expect(body.message).toContain('Could not sign the OID4VP request object')
    expect(body.message).toContain(DOUBLE_SIGNING_TENANT)
    expect(body.message).toContain('SIGNING_SERVICE')
    // The degrade this arm exists to make impossible.
    expect(body.message).toContain('was NOT')
  })

  test('a refusal from the signing service is OURS, never forwarded to the wallet', async () => {
    signingBehaviour = 'refuse'
    const response = await fetchRequest(SIGNED_PROFILE)
    // ⚠️ NOT 400. `upstream-call.ts` forwards an upstream 4xx with problem
    // details to the caller — correct for a status-list conflict, wrong here:
    // a 400 would tell a wallet its request was bad when the fault is entirely
    // ours.
    expect(response.status).toBe(502)
    const body = (await response.json()) as {
      message: string
      problemDetails?: unknown
    }
    expect(body.problemDetails).toBeUndefined()
    expect(body.message).toContain('Could not sign the OID4VP request object')
  })

  test('a 200 with an EMPTY signature segment is refused, not served', async () => {
    signingBehaviour = 'unsigned-body'
    const response = await fetchRequest(SIGNED_PROFILE)
    expect(response.status).toBe(502)
    expect(await response.text()).not.toContain('vp_token')
  })

  test.each([
    ['unreachable' as const],
    ['refuse' as const],
    ['unsigned-body' as const]
  ])(
    'a %s signing service never yields an unsigned or JSON request object',
    async (behaviour) => {
      signingBehaviour = behaviour
      const response = await fetchRequest(SIGNED_PROFILE)
      const body = await response.text()
      expect(response.headers.get('content-type')).not.toContain(
        'oauth-authz-req+jwt'
      )
      expect(body).not.toContain('"alg":"none"')
      expect(body).not.toContain('dcql_query')
    }
  )
})

describe('a tenant with no entity identity cannot serve this arm', () => {
  test('minting refuses loudly, naming the tenant and the configuration', async () => {
    activeProfileName = SIGNED_PROFILE
    const response = await app.request('/workflows/verify/exchanges', {
      method: 'POST',
      body: JSON.stringify({
        variables: {
          exchangeHost: EXCHANGE_HOST,
          tenantName: 'default',
          vprContext: ['https://www.w3.org/2018/credentials/v1'],
          vprCredentialType: ['VerifiableCredential'],
          trustedIssuers: [],
          vprClaims: []
        }
      }),
      headers: { 'Content-Type': 'application/json' }
    })
    // ⚠️ At MINT — not mid-exchange when a wallet fetches.
    expect(response.status).toBe(500)
    const body = (await response.json()) as { message: string }
    expect(body.message).toContain('declares no entity identity')
    expect(body.message).toContain('TENANT_ISSUER_1_ID_DEFAULT')
    expect(body.message).not.toBe('An unexpected error occurred')
  })
})

describe('⚠️ the other arm is unchanged and still reachable', () => {
  test('the raw-JSON control still answers application/json', async () => {
    const response = await fetchRequest(JSON_PROFILE)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('application/json')
    const body = (await response.json()) as Record<string, unknown>
    expect(body.client_id).toContain('redirect_uri:')
    expect(signingCalls).toHaveLength(0)
  })

  // ⚠️ **There is no third arm to assert here, and there must not be one.** No
  // construction answers `alg: none` with an empty signature segment while
  // never touching the signing service, so a JWT served at `request_uri` is
  // always a signed one — see
  // `docs/adr/2026-08-25-oid4vp-request-object-envelopes.md` §2. The assertion
  // above is the one that carries the weight: the raw-JSON arm is untouched by
  // the signed arm's existence, and neither of them calls out unless asked to.
})
