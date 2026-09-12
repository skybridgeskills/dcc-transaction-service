/**
 * The VPR differential arms actually vary what they claim to vary.
 *
 * ⚠️ **An arm that does not change the thing it is named for teaches
 * nothing**, and the failure is silent: the profile name says one thing, the
 * wallet refuses, and the refusal is attributed to a field that was never
 * altered. Each assertion below is against the VPR as it appears in the served
 * protocols envelope, not against a builder's return value.
 *
 * Every row these arms remove is something this service ADDS and some
 * verifiers omit — the shape of a defect where a stricter parser chokes on an
 * optional member.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'

const EXCHANGE_HOST = 'http://localhost:4005'

let activeProfileName: string | undefined

beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    tenantAuthenticationEnabled: false,
    ...(activeProfileName
      ? { defaultProtocolProfileName: activeProfileName }
      : {})
  }))
})

afterAll(() => {
  activeProfileName = undefined
  vi.restoreAllMocks()
})

interface Vpr {
  query: Array<Record<string, unknown>>
  interact?: { service: Array<Record<string, unknown>> }
  domain: string
  acceptedCryptosuites?: unknown[]
}

const vprFor = async (profile: string | undefined): Promise<Vpr> => {
  activeProfileName = profile
  const response = await app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: EXCHANGE_HOST,
        tenantName: 'default',
        vprContext: [],
        vprCredentialType: ['OpenBadgeCredential'],
        trustedIssuers: [],
        vprClaims: []
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const protocols = (await response.json()) as {
    verifiablePresentationRequest: Vpr
  }
  return protocols.verifiablePresentationRequest
}

const didAuthQueryOf = (vpr: Vpr): Record<string, unknown> => {
  const entry = vpr.query.find((q) => q.type === 'DIDAuthentication')
  if (!entry) throw new Error('no DIDAuthentication query in the VPR')
  return entry
}

describe('the baseline this is measured against', () => {
  test('the default VPR carries all three of the fields the arms remove', async () => {
    const vpr = await vprFor(undefined)

    expect(vpr.domain).toContain('/workflows/verify/exchanges/')
    expect(vpr.acceptedCryptosuites).toBeDefined()
    expect(didAuthQueryOf(vpr).acceptedCryptosuites).toBeDefined()
    expect(vpr.interact?.service).toHaveLength(2)
  })
})

describe('vcapi-vpr-bare-origin-domain', () => {
  test('`domain` becomes the bare origin, and nothing else moves', async () => {
    const vpr = await vprFor('vcapi-vpr-bare-origin-domain')

    expect(vpr.domain).toBe(EXCHANGE_HOST)
    // Single-variable: the other two differential fields are untouched, so a
    // refusal against this profile attributes to `domain` alone.
    expect(vpr.acceptedCryptosuites).toBeDefined()
    expect(didAuthQueryOf(vpr).acceptedCryptosuites).toBeDefined()
    expect(vpr.interact?.service).toHaveLength(2)
  })
})

describe('vcapi-vpr-no-accepted-cryptosuites', () => {
  test('`acceptedCryptosuites` is gone from BOTH positions', async () => {
    const vpr = await vprFor('vcapi-vpr-no-accepted-cryptosuites')

    expect(vpr.acceptedCryptosuites).toBeUndefined()
    expect(didAuthQueryOf(vpr).acceptedCryptosuites).toBeUndefined()
  })

  test('⚠️ but `acceptedMethods` STAYS — that pairing is the whole point', async () => {
    // Some verifiers emit `acceptedMethods` with no
    // `acceptedCryptosuites` beside it. A profile field that bundled the two
    // could not express this, which is why they were split.
    const vpr = await vprFor('vcapi-vpr-no-accepted-cryptosuites')

    expect(didAuthQueryOf(vpr).acceptedMethods).toEqual([
      { method: 'key' },
      { method: 'web' },
      { method: 'jwk' }
    ])
  })

  test('single-variable: `domain` and the services are untouched', async () => {
    const vpr = await vprFor('vcapi-vpr-no-accepted-cryptosuites')

    expect(vpr.domain).toContain('/workflows/verify/exchanges/')
    expect(vpr.interact?.service).toHaveLength(2)
  })
})

describe('vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites', () => {
  test('both omissions at once', async () => {
    const vpr = await vprFor(
      'vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites'
    )

    expect(vpr.domain).toBe(EXCHANGE_HOST)
    expect(vpr.acceptedCryptosuites).toBeUndefined()
    expect(didAuthQueryOf(vpr).acceptedCryptosuites).toBeUndefined()
    expect(didAuthQueryOf(vpr).acceptedMethods).toBeDefined()
  })
})

describe('what the arms do NOT touch', () => {
  test('⚠️ none of them alters the OID4VP arm', async () => {
    // These are interaction-URL-method arms. If one of them also moved the
    // OID4VP request, a refusal on the other interaction method would be
    // misattributed.
    for (const profile of [
      'vcapi-vpr-bare-origin-domain',
      'vcapi-vpr-no-accepted-cryptosuites',
      'vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites'
    ]) {
      activeProfileName = profile
      const response = await app.request('/workflows/verify/exchanges', {
        method: 'POST',
        body: JSON.stringify({
          variables: {
            exchangeHost: EXCHANGE_HOST,
            tenantName: 'default',
            vprContext: [],
            vprCredentialType: ['OpenBadgeCredential'],
            trustedIssuers: [],
            vprClaims: []
          }
        }),
        headers: { 'Content-Type': 'application/json' }
      })
      const protocols = (await response.json()) as { OID4VP?: string }
      expect(protocols.OID4VP).toContain('request_uri=')
    }
  })
})
