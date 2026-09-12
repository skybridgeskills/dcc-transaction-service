/**
 * The per-exchange knobs are RETIRED, not removed — and this file is what makes
 * that sentence checkable.
 *
 * ⚠️ **Recorded runs cite these fields.** A re-run months from now must
 * emit what it emitted the first time, or two records of the same construction
 * quietly stop meaning the same thing. So each knob still
 * works, still beats the active profile, and is deprecated in its JSDoc rather
 * than deleted.
 *
 * The protocol goldens (`protocol-goldens.test.ts`, against
 * `src/test-fixtures/protocol-goldens/`) are the real acceptance for "the bytes
 * did not move"; these
 * tests cover the parts a golden cannot see — precedence between two sources
 * that disagree, and the fields deliberately left alone.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'

const EXCHANGE_HOST = 'http://localhost:4005'
/** Any registered profile: these cases are about the knob/profile collision. */
const NAMED_PROFILE = 'oid4vp-1.0-json-by-reference-pex-redirect-uri'
const BY_VALUE_PROFILE = 'oid4vp-1.0-by-value-dcql-redirect-uri'

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

const create = async (
  variables: Record<string, unknown>
): Promise<Response> =>
  app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: EXCHANGE_HOST,
        tenantName: 'default',
        vprContext: [],
        vprCredentialType: ['OpenBadgeCredential'],
        trustedIssuers: [],
        vprClaims: [],
        ...variables
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })

const protocolsOf = async (
  variables: Record<string, unknown>
): Promise<Record<string, string>> => {
  const response = await create(variables)
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, string>
}

describe('⚠️ a knob on the exchange BEATS a profile from a broader layer', () => {
  test('a by-value knob wins over an app-default profile that says by-reference', async () => {
    // The in-flight-exchange protection, and the reason precedence runs this
    // way rather than the other. A deployment configuring a profile must not
    // reinterpret an exchange that was created before profiles existed.
    activeProfileName = NAMED_PROFILE
    try {
      const protocols = await protocolsOf({ oid4vpDelivery: 'by-value' })
      expect(protocols.OID4VP).not.toContain('request_uri=')
    } finally {
      activeProfileName = undefined
    }
  })

  test('a pex knob wins over an app-default profile that says dcql', async () => {
    // ⚠️ The by-value profile is the vehicle on purpose: it makes the second
    // half of the claim visible. The knob overrides ONE field — the query
    // language — and every other field the profile states is still in force, so
    // the request must come out by value AND in PEX.
    activeProfileName = BY_VALUE_PROFILE
    try {
      const protocols = await protocolsOf({ oid4vpQueryLanguage: 'pex' })
      const deepLink = protocols.OID4VP!

      // The knob won on its own field.
      expect(deepLink).toContain('presentation_definition=')
      expect(deepLink).not.toContain('dcql_query=')
      // ⚠️ And the profile still decided everything else: by value, so there is
      // no `request_uri` for a wallet to fetch.
      expect(deepLink).not.toContain('request_uri=')
    } finally {
      activeProfileName = undefined
    }
  })

  test('with no knob set, the profile decides', async () => {
    activeProfileName = BY_VALUE_PROFILE
    try {
      const protocols = await protocolsOf({})
      expect(protocols.OID4VP).not.toContain('request_uri=')
    } finally {
      activeProfileName = undefined
    }
  })

  test('with neither, the historical default decides', async () => {
    const protocols = await protocolsOf({})
    expect(protocols.OID4VP).toContain('request_uri=')
  })
})

describe('⚠️ a knob and a profile name on the SAME request is refused', () => {
  // Two layers disagreeing is the resolution rule working. One caller saying
  // two things about one wire field in one breath has no tie to break.
  test.each([
    ['oid4vpDelivery', 'by-value'],
    ['oid4vpQueryLanguage', 'pex'],
    ['vprLimitDisclosure', 'required']
  ])('naming a profile and setting `%s` is a 400', async (knob, value) => {
    const response = await create({
      protocolProfileName: NAMED_PROFILE,
      [knob]: value
    })

    expect(response.status).toBe(400)
    expect(JSON.stringify(await response.json())).toContain('supersedes')
  })

  test('naming a profile with no superseded knob is fine', async () => {
    const response = await create({ protocolProfileName: NAMED_PROFILE })
    expect(response.status).toBe(200)
  })

  test('setting a knob with no profile named is fine', async () => {
    const response = await create({ oid4vpDelivery: 'by-value' })
    expect(response.status).toBe(200)
  })
})

describe('the fields deliberately NOT migrated still work', () => {
  test('per-exchange request CONTENT stays on the exchange', async () => {
    // ⚠️ Wire-affecting, but not profile fields: they vary per exchange by
    // design — what you are asking for — where a profile varies by construction
    // — how you ask. A profile per query would be a registry explosion.
    const protocols = await protocolsOf({
      vprContext: ['https://www.w3.org/2018/credentials/v1'],
      vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
      vprClaims: [
        { path: ['credentialSubject', 'achievement', 'name'], values: ['Welding'] }
      ]
    })
    const vpr = protocols.verifiablePresentationRequest as unknown as {
      query: Array<{ credentialQuery?: { example?: { type?: string[] } } }>
    }

    expect(
      vpr.query.some((q) =>
        q.credentialQuery?.example?.type?.includes('OpenBadgeCredential')
      )
    ).toBe(true)
  })

  test('⚠️ verification controls never reach the wire, and are not profile fields', async () => {
    // `trustedIssuers` and `trustedRegistries` shape VERIFICATION, not the
    // request: `getCredentialQuery` takes `trustedIssuers` and discards it.
    // They are accepted, stored, and absent from every emitted byte.
    const protocols = await protocolsOf({
      trustedIssuers: ['did:web:trusted.example'],
      trustedRegistries: []
    })

    expect(JSON.stringify(protocols)).not.toContain('trusted.example')
  })

  test('the deliberate-corruption control stays on the exchange', async () => {
    // `tamper` corrupts the issued CREDENTIAL, not the request construction.
    const response = await create({ tamper: 'proof' })
    expect(response.status).toBe(200)
  })
})
