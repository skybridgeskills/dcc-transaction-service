/**
 * Hono integration tests for the OID4VCI Pre-Authorized Code Flow.
 *
 * Phase 2 covers the credential offer route + the new `oid4vci` field
 * on the protocols response. Subsequent phases extend this file with
 * token, nonce, and credential endpoints.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import { getDataForExchangeSetupPost } from '../test-fixtures/testData.js'
import { getSignedDIDAuth } from '../didAuth.js'
import { getExchangeData } from '../transactionManager.js'
import {
  credentialOfferSchema,
  issuerMetadataSchema,
  oid4vciAsMetadataSchema,
  PRE_AUTHORIZED_GRANT
} from './schemas.js'

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

const createClaimExchange = async () => {
  const setup = getDataForExchangeSetupPost(
    'default',
    'http://localhost:4005',
    'claim'
  )
  const response = await app.request('/exchange', {
    method: 'POST',
    body: JSON.stringify(setup),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as App.DCCWalletQuery[]
  // The first wallet query carries the exchangeId in its `directDeepLink`'s
  // `vc_request_url` query param; we need only the exchangeId for this test.
  const url = new URL(body[0]!.directDeepLink)
  const vcRequestUrl = decodeURIComponent(
    url.searchParams.get('vc_request_url')!
  )
  const path = new URL(vcRequestUrl).pathname
  // path is /workflows/claim/exchanges/<id>/<txId> for the directDeepLink
  // OR /workflows/claim/exchanges/<id> for the vprDeepLink
  const exchangeId = path.split('/exchanges/')[1]!.split('/')[0]
  return { exchangeId }
}

describe('OID4VCI · protocols field', () => {
  test('GET /workflows/claim/exchanges/:id/protocols includes `OID4VCI`', async () => {
    const { exchangeId } = await createClaimExchange()
    const response = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/protocols`
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { protocols: { OID4VCI?: string } }
    expect(body.protocols.OID4VCI).toBeDefined()
    expect(body.protocols.OID4VCI!.startsWith('openid-credential-offer://')).toBe(
      true
    )
    expect(body.protocols.OID4VCI).toContain('credential_offer_uri=')
    expect(decodeURIComponent(body.protocols.OID4VCI!)).toContain(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
    )
  })

  test('didAuth exchange does not surface `OID4VCI`', async () => {
    const setup = getDataForExchangeSetupPost(
      'default',
      'http://localhost:4005',
      'didAuth'
    )
    const r = await app.request('/exchange', {
      method: 'POST',
      body: JSON.stringify(setup),
      headers: { 'Content-Type': 'application/json' }
    })
    const wallet = (await r.json()) as App.DCCWalletQuery[]
    const url = new URL(wallet[0]!.directDeepLink)
    const vcRequestUrl = decodeURIComponent(
      url.searchParams.get('vc_request_url')!
    )
    const exchangeId = new URL(vcRequestUrl).pathname
      .split('/exchanges/')[1]!
      .split('/')[0]

    const protocolsResponse = await app.request(
      `/workflows/didAuth/exchanges/${exchangeId}/protocols`
    )
    const body = (await protocolsResponse.json()) as {
      protocols: { OID4VCI?: string }
    }
    expect(body.protocols.OID4VCI).toBeUndefined()
  })
})

describe('OID4VCI · GET /openid/credential-offer', () => {
  test('returns a spec-shaped credential offer JSON', async () => {
    const { exchangeId } = await createClaimExchange()
    const response = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('json')
    const offer = credentialOfferSchema.parse(await response.json())
    expect(offer.credential_issuer).toContain(
      `/workflows/claim/exchanges/${exchangeId}`
    )
    expect(offer.credential_configuration_ids.length).toBeGreaterThan(0)
    expect(
      offer.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code'].length
    ).toBeGreaterThan(20)
  })

  test('is idempotent: the pre-authorized code is reused on repeat GET', async () => {
    const { exchangeId } = await createClaimExchange()
    const url = `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
    const a = credentialOfferSchema.parse(await (await app.request(url)).json())
    const b = credentialOfferSchema.parse(await (await app.request(url)).json())
    expect(a.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']).toBe(
      b.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']
    )
  })

  test('rejects with 400 for non-claim exchanges', async () => {
    const setup = getDataForExchangeSetupPost(
      'default',
      'http://localhost:4005',
      'didAuth'
    )
    const r = await app.request('/exchange', {
      method: 'POST',
      body: JSON.stringify(setup),
      headers: { 'Content-Type': 'application/json' }
    })
    const wallet = (await r.json()) as App.DCCWalletQuery[]
    const url = new URL(wallet[0]!.directDeepLink)
    const vcRequestUrl = decodeURIComponent(
      url.searchParams.get('vc_request_url')!
    )
    const exchangeId = new URL(vcRequestUrl).pathname
      .split('/exchanges/')[1]!
      .split('/')[0]

    const response = await app.request(
      `/workflows/didAuth/exchanges/${exchangeId}/openid/credential-offer`
    )
    expect(response.status).toBe(400)
  })

  test('returns 404 for an unknown exchange id', async () => {
    const response = await app.request(
      '/workflows/claim/exchanges/does-not-exist/openid/credential-offer'
    )
    expect(response.status).toBe(404)
  })
})

describe('OID4VCI · GET /.well-known/openid-credential-issuer/...', () => {
  test('returns spec-shaped issuer metadata for a claim exchange', async () => {
    const { exchangeId } = await createClaimExchange()
    const response = await app.request(
      `/.well-known/openid-credential-issuer/workflows/claim/exchanges/${exchangeId}`
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('json')
    const md = issuerMetadataSchema.parse(await response.json())
    expect(md.credential_issuer).toContain(
      `/workflows/claim/exchanges/${exchangeId}`
    )
    expect(md.credential_endpoint.endsWith('/openid/credential')).toBe(true)
    expect(md.nonce_endpoint.endsWith('/openid/nonce')).toBe(true)
    const configIds = Object.keys(md.credential_configurations_supported)
    expect(configIds.length).toBe(1)
    const cfg = md.credential_configurations_supported[configIds[0]!]
    expect(cfg!.format).toBe('ldp_vc')
  })

  test('returns 404 for a non-claim exchange', async () => {
    const setup = getDataForExchangeSetupPost(
      'default',
      'http://localhost:4005',
      'didAuth'
    )
    const r = await app.request('/exchange', {
      method: 'POST',
      body: JSON.stringify(setup),
      headers: { 'Content-Type': 'application/json' }
    })
    const wallet = (await r.json()) as App.DCCWalletQuery[]
    const url = new URL(wallet[0]!.directDeepLink)
    const vcRequestUrl = decodeURIComponent(
      url.searchParams.get('vc_request_url')!
    )
    const exchangeId = new URL(vcRequestUrl).pathname
      .split('/exchanges/')[1]!
      .split('/')[0]
    const response = await app.request(
      `/.well-known/openid-credential-issuer/workflows/didAuth/exchanges/${exchangeId}`
    )
    expect(response.status).toBe(404)
  })

  test('returns 404 for an unknown exchange id', async () => {
    const response = await app.request(
      '/.well-known/openid-credential-issuer/workflows/claim/exchanges/missing'
    )
    expect(response.status).toBe(404)
  })
})

describe('OID4VCI · GET /.well-known/oauth-authorization-server/...', () => {
  test('returns spec-shaped AS metadata for a claim exchange', async () => {
    const { exchangeId } = await createClaimExchange()
    const response = await app.request(
      `/.well-known/oauth-authorization-server/workflows/claim/exchanges/${exchangeId}`
    )
    expect(response.status).toBe(200)
    const md = oid4vciAsMetadataSchema.parse(await response.json())
    expect(md.token_endpoint.endsWith('/openid/token')).toBe(true)
    expect(md.grant_types_supported).toEqual([PRE_AUTHORIZED_GRANT])
    expect(md['pre-authorized_grant_anonymous_access_supported']).toBe(true)
  })

  test('returns 404 for an unknown exchange id', async () => {
    const response = await app.request(
      '/.well-known/oauth-authorization-server/workflows/claim/exchanges/missing'
    )
    expect(response.status).toBe(404)
  })
})

const fetchOffer = async (exchangeId: string) => {
  const r = await app.request(
    `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
  )
  return (await r.json()) as {
    grants: Record<string, { 'pre-authorized_code': string }>
  }
}

const tokenRequest = async (exchangeId: string, body: URLSearchParams) =>
  app.request(`/workflows/claim/exchanges/${exchangeId}/openid/token`, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })

describe('OID4VCI · POST /openid/token', () => {
  test('happy path: redeems pre-auth code, returns Bearer access_token', async () => {
    const { exchangeId } = await createClaimExchange()
    const offer = await fetchOffer(exchangeId)
    const code = offer.grants[PRE_AUTHORIZED_GRANT]!['pre-authorized_code']

    const response = await tokenRequest(
      exchangeId,
      new URLSearchParams({
        grant_type: PRE_AUTHORIZED_GRANT,
        'pre-authorized_code': code
      })
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toContain('no-store')
    const body = (await response.json()) as {
      access_token: string
      token_type: string
      expires_in: number
    }
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBeGreaterThan(0)
    expect(body.access_token.length).toBeGreaterThan(20)
  })

  test('returns invalid_grant on replay', async () => {
    const { exchangeId } = await createClaimExchange()
    const offer = await fetchOffer(exchangeId)
    const code = offer.grants[PRE_AUTHORIZED_GRANT]!['pre-authorized_code']
    const params = new URLSearchParams({
      grant_type: PRE_AUTHORIZED_GRANT,
      'pre-authorized_code': code
    })
    const first = await tokenRequest(exchangeId, params)
    expect(first.status).toBe(200)
    const second = await tokenRequest(exchangeId, params)
    expect(second.status).toBe(400)
    const body = (await second.json()) as { error: string }
    expect(body.error).toBe('invalid_grant')
  })

  test('returns unsupported_grant_type for an unknown grant', async () => {
    const { exchangeId } = await createClaimExchange()
    const r = await tokenRequest(
      exchangeId,
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: 'abc'
      })
    )
    expect(r.status).toBe(400)
    const body = (await r.json()) as { error: string }
    expect(body.error).toBe('unsupported_grant_type')
  })

  test('returns invalid_request when pre-authorized_code is missing', async () => {
    const { exchangeId } = await createClaimExchange()
    const r = await tokenRequest(
      exchangeId,
      new URLSearchParams({ grant_type: PRE_AUTHORIZED_GRANT })
    )
    expect(r.status).toBe(400)
    const body = (await r.json()) as { error: string }
    expect(body.error).toBe('invalid_request')
  })
})

describe('OID4VCI · POST /openid/nonce', () => {
  test('mints a c_nonce and returns it with no-store', async () => {
    const { exchangeId } = await createClaimExchange()
    const r = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/nonce`,
      { method: 'POST' }
    )
    expect(r.status).toBe(200)
    expect(r.headers.get('cache-control')).toContain('no-store')
    const body = (await r.json()) as { c_nonce: string }
    expect(body.c_nonce.length).toBeGreaterThan(10)
  })

  test('returns a different nonce on each call', async () => {
    const { exchangeId } = await createClaimExchange()
    const a = (await (
      await app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/nonce`,
        { method: 'POST' }
      )
    ).json()) as { c_nonce: string }
    const b = (await (
      await app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/nonce`,
        { method: 'POST' }
      )
    ).json()) as { c_nonce: string }
    expect(b.c_nonce).not.toBe(a.c_nonce)
  })
})

describe('OID4VCI · POST /openid/credential — full pre-authorized flow', () => {
  test('walks: offer → token → nonce → credential, returning a signed VC', async () => {
    const { exchangeId } = await createClaimExchange()

    // 1. Credential Offer (mints + persists pre-authorized code)
    const offerResp = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
    )
    const offer = credentialOfferSchema.parse(await offerResp.json())
    const code = offer.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']

    // 2. Token Request
    const tokenResp = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/token`,
      {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: PRE_AUTHORIZED_GRANT,
          'pre-authorized_code': code
        }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )
    expect(tokenResp.status).toBe(200)
    const tokenBody = (await tokenResp.json()) as { access_token: string }

    // 3. Nonce Request
    const nonceResp = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/nonce`,
      { method: 'POST' }
    )
    expect(nonceResp.status).toBe(200)
    const { c_nonce } = (await nonceResp.json()) as { c_nonce: string }

    // 4. Sign a DI VP bound to c_nonce as the di_vp key proof
    const vp = await getSignedDIDAuth(c_nonce)

    // 5. Credential Request
    const credResp = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credential_configuration_id: 'OpenBadgeCredential',
          proofs: { di_vp: [vp] }
        })
      }
    )
    expect(credResp.status).toBe(200)
    expect(credResp.headers.get('cache-control')).toContain('no-store')
    const credBody = (await credResp.json()) as {
      credentials: Array<{ credential: unknown }>
    }
    expect(credBody.credentials).toHaveLength(1)

    // 6. Exchange transitioned to complete with the credential persisted
    const finalExchange = (await getExchangeData(
      exchangeId,
      'claim'
    )) as App.ExchangeDetailClaim
    expect(finalExchange.state).toBe('complete')
    expect(
      finalExchange.variables.results?.default.verifiableCredential
    ).toBeDefined()
  })

  test('rejects a second credential request once the exchange is complete', async () => {
    const { exchangeId } = await createClaimExchange()
    const offer = credentialOfferSchema.parse(
      await (
        await app.request(
          `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
        )
      ).json()
    )
    const code = offer.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']
    const tokenBody = (await (
      await app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/token`,
        {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: PRE_AUTHORIZED_GRANT,
            'pre-authorized_code': code
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      )
    ).json()) as { access_token: string }

    const issue = async () => {
      const { c_nonce } = (await (
        await app.request(
          `/workflows/claim/exchanges/${exchangeId}/openid/nonce`,
          { method: 'POST' }
        )
      ).json()) as { c_nonce: string }
      const vp = await getSignedDIDAuth(c_nonce)
      return app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/credential`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenBody.access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            credential_configuration_id: 'OpenBadgeCredential',
            proofs: { di_vp: [vp] }
          })
        }
      )
    }

    const first = await issue()
    expect(first.status).toBe(200)

    // A fresh nonce + valid token must not re-issue against a complete exchange.
    const second = await issue()
    expect(second.status).toBe(400)
    const body = (await second.json()) as { error: string }
    expect(body.error).toBe('credential_request_denied')
  })

  test('rejects a VP whose self-asserted holder differs from the proof signer', async () => {
    const { exchangeId } = await createClaimExchange()
    const offer = credentialOfferSchema.parse(
      await (
        await app.request(
          `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
        )
      ).json()
    )
    const code = offer.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']
    const tokenBody = (await (
      await app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/token`,
        {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: PRE_AUTHORIZED_GRANT,
            'pre-authorized_code': code
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      )
    ).json()) as { access_token: string }
    const { c_nonce } = (await (
      await app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/nonce`,
        { method: 'POST' }
      )
    ).json()) as { c_nonce: string }

    // Signed by the test key, but claiming a holder DID the signer does not
    // control. Must be rejected rather than issuing to the unowned DID.
    const vp = await getSignedDIDAuth(c_nonce, 'did:example:victim')
    const resp = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credential_configuration_id: 'OpenBadgeCredential',
          proofs: { di_vp: [vp] }
        })
      }
    )
    expect(resp.status).toBe(400)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('invalid_proof')

    // No credential was issued: the exchange never reached `complete`.
    const exchange = (await getExchangeData(
      exchangeId,
      'claim'
    )) as App.ExchangeDetailClaim
    expect(exchange.state).not.toBe('complete')
  })

  test('nonce defense: a proof bound to a non-issued nonce returns invalid_nonce', async () => {
    const { exchangeId } = await createClaimExchange()
    const offer = credentialOfferSchema.parse(
      await (
        await app.request(
          `/workflows/claim/exchanges/${exchangeId}/openid/credential-offer`
        )
      ).json()
    )
    const code = offer.grants[PRE_AUTHORIZED_GRANT]['pre-authorized_code']
    const tokenBody = (await (
      await app.request(
        `/workflows/claim/exchanges/${exchangeId}/openid/token`,
        {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: PRE_AUTHORIZED_GRANT,
            'pre-authorized_code': code
          }),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
      )
    ).json()) as { access_token: string }
    // Mint a nonce, but bind the proof to a *different* challenge that was
    // never issued as this exchange's c_nonce. Keeps nonce-defense coverage
    // independent of the completion guard (the exchange never completes here).
    await app.request(`/workflows/claim/exchanges/${exchangeId}/openid/nonce`, {
      method: 'POST'
    })
    const vp = await getSignedDIDAuth('never-issued-nonce')

    const resp = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${tokenBody.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credential_configuration_id: 'OpenBadgeCredential',
          proofs: { di_vp: [vp] }
        })
      }
    )
    expect(resp.status).toBe(400)
    const body = (await resp.json()) as { error: string }
    expect(body.error).toBe('invalid_nonce')
  })

  test('returns 401 with no Bearer header', async () => {
    const { exchangeId } = await createClaimExchange()
    const r = await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/credential`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential_configuration_id: 'OpenBadgeCredential',
          proofs: { di_vp: [{}] }
        })
      }
    )
    expect(r.status).toBe(401)
    const body = (await r.json()) as { error: string }
    expect(body.error).toBe('invalid_token')
  })
})
