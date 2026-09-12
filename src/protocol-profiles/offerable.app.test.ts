/**
 * The offerable preset set, asserted through the route that serves it.
 *
 * ⚠️ **Every payload assertion is on bytes the server built.** The point of this
 * endpoint is that the page never constructs a payload, so a test that built one
 * to compare against would be asserting the thing the design refuses to do.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import { axisDiff, offerablePresets } from './offerable.js'
import { getExchangeData } from '../transactionManager.js'
import type { Wallet } from '../lib/wallets/index.js'

const EXCHANGE_HOST = 'http://localhost:4005'
const DEFAULT_PROFILE = 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
const PEX_PROFILE = 'oid4vp-1.0-json-by-reference-pex-redirect-uri'
const VPR_PROFILES = [
  'vcapi-vpr-bare-origin-domain',
  'vcapi-vpr-no-accepted-cryptosuites',
  'vcapi-vpr-bare-origin-domain-no-accepted-cryptosuites'
]

interface Preset {
  id: string
  payloadId: string
  protocolProfileName: string | null
  isDefault: boolean
  axes: Array<{ field: string; value: string }>
  productIds: string[]
  payload: string
}

/** Read by the `getConfig` spy so a case can set the app default per run. */
let activeProfileName: string | undefined

beforeAll(() => {
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const cur = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...cur,
    statusService: '',
    tenantAuthenticationEnabled: false,
    defaultProtocolProfileName: activeProfileName
  }))
})

afterAll(() => {
  vi.restoreAllMocks()
})

const VERIFY_BASE = {
  vprContext: ['https://www.w3.org/2018/credentials/v1'],
  vprCredentialType: ['VerifiableCredential', 'OpenBadgeCredential'],
  trustedIssuers: [],
  vprClaims: [
    { path: ['credentialSubject', 'achievement', 'name'], values: ['Welding'] }
  ]
}

const createVerifyExchange = async (
  variables: Record<string, unknown> = {}
): Promise<string> => {
  const response = await app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        exchangeHost: EXCHANGE_HOST,
        tenantName: 'default',
        ...VERIFY_BASE,
        ...variables
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const protocols = (await response.json()) as { vcapi: string }
  return new URL(protocols.vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]!
}

const fetchPresets = async (exchangeId: string): Promise<Preset[]> => {
  const response = await app.request(`/interactions/${exchangeId}/presets`)
  expect(response.status).toBe(200)
  return ((await response.json()) as { presets: Preset[] }).presets
}

const on = (presets: Preset[], payloadId: string): Preset[] =>
  presets.filter((p) => p.payloadId === payloadId)

describe('offerable presets · the default preset cannot disagree with the envelope', () => {
  test("the default preset's payload is byte-identical to getProtocols'", async () => {
    activeProfileName = DEFAULT_PROFILE
    const exchangeId = await createVerifyExchange()
    const envelope = (
      (await (
        await app.request(`/interactions/${exchangeId}`, {
          headers: { Accept: 'application/json' }
        })
      ).json()) as { protocols: Record<string, string> }
    ).protocols
    const presets = await fetchPresets(exchangeId)

    // ⚠️ The picker's first row and the envelope are the same bytes, or the page
    // shows one thing and a recorded run cites another.
    for (const payloadId of ['iu', 'OID4VP', 'vcapi']) {
      const active = on(presets, payloadId).find((p) => p.isDefault)
      expect(active?.payload).toBe(envelope[payloadId])
    }
  })

  test('⚠️ the active preset carries no pin at all', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    for (const preset of presets.filter((p) => p.isDefault)) {
      expect(preset.payload).not.toContain('protocolProfile')
    }
  })
})

describe('offerable presets · the pin rides where it is fetched', () => {
  test('a non-default preset on the interaction method carries the pin', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    const pinned = on(presets, 'iu').find((p) => !p.isDefault)
    expect(pinned).toBeDefined()
    expect(pinned!.payload).toContain(
      `protocolProfile=${encodeURIComponent(pinned!.protocolProfileName!)}`
    )
  })

  // ⚠️ **The OID4VP interaction method has no non-default preset to assert
  // against.** Every registered profile either differs from the default on a
  // mint-bound axis or changes no OID4VP byte, so filter 2 collapses the whole
  // interaction method to one row. Two cases therefore have no vehicle here:
  // that the pin rides one level in, nested inside `request_uri` rather than on
  // the deep link, and that fetching that `request_uri` serves the elected
  // construction. The nesting itself is covered from the reading end by
  // `lib/interaction-method.test.ts` ("finds a pin nested inside a
  // percent-encoded request_uri"). ⚠️ Add both cases with the next profile that
  // varies a request-scoped OID4VP axis.

  test('⚠️ the pin round-trips: fetching it serves bytes that profile states', async () => {
    activeProfileName = DEFAULT_PROFILE
    const exchangeId = await createVerifyExchange()
    const presets = await fetchPresets(exchangeId)
    const pinned = on(presets, 'iu').find(
      (p) => p.protocolProfileName === 'vcapi-vpr-bare-origin-domain'
    )!
    const served = await app.request(
      new URL(pinned.payload).pathname + new URL(pinned.payload).search,
      { headers: { Accept: 'application/json' } }
    )
    expect(served.status).toBe(200)
    const envelope = (await served.json()) as {
      protocols: { verifiablePresentationRequest: { domain: string } }
    }
    // The axis that profile states, served because the payload carried its pin.
    expect(envelope.protocols.verifiablePresentationRequest.domain).toBe(
      EXCHANGE_HOST
    )
  })
})

describe('offerable presets · the two filters', () => {
  test('⚠️ no by-value profile appears, on any method', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    const names = presets.map((p) => p.protocolProfileName)
    expect(names).not.toContain('oid4vp-1.0-by-value-dcql-redirect-uri')
    expect(names).not.toContain('oid4vp-1.0-by-value-pex-redirect-uri')
  })

  test('⚠️ no mint-bound profile appears either — one question, one answer', async () => {
    // PEX changes an axis the response leg reads, so it is not electable and
    // therefore not offerable. The filter asks `assertElectable`, so a refusal
    // added later removes its profile from here without touching this module.
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    expect(presets.map((p) => p.protocolProfileName)).not.toContain(PEX_PROFILE)
  })

  test('⚠️ profiles with identical bytes on a method yield ONE preset there, and stay distinct elsewhere', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())

    // The three VPR-differential profiles change no OID4VP byte, so on that
    // interaction method they ARE the default construction — one option, not
    // four.
    const vprOnOid4vp = on(presets, 'OID4VP').filter((p) =>
      VPR_PROFILES.includes(p.protocolProfileName ?? '')
    )
    expect(vprOnOid4vp).toEqual([])

    // On the interaction URL they each change the VPR, so each is its own row.
    const vprOnIu = on(presets, 'iu')
      .map((p) => p.protocolProfileName)
      .filter((n) => VPR_PROFILES.includes(n ?? ''))
    expect(vprOnIu.sort()).toEqual(VPR_PROFILES.slice().sort())
  })

  test('⚠️ every payload on a method is distinct', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    for (const payloadId of new Set(presets.map((p) => p.payloadId))) {
      const payloads = on(presets, payloadId).map((p) => p.payload)
      expect(new Set(payloads).size).toBe(payloads.length)
    }
  })

  test('⚠️ a knob-bearing exchange offers only its active preset, per method', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(
      await createVerifyExchange({ oid4vpQueryLanguage: 'pex' })
    )
    expect(presets.every((p) => p.isDefault)).toBe(true)
  })

  test('⚠️ an exchange that named its own profile offers only that', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(
      await createVerifyExchange({
        protocolProfileName: 'vcapi-vpr-bare-origin-domain'
      })
    )
    expect(presets.every((p) => p.isDefault)).toBe(true)
    expect(presets[0]!.protocolProfileName).toBe('vcapi-vpr-bare-origin-domain')
  })
})

describe('offerable presets · the axis diff is generic', () => {
  test('⚠️ a field added to a fixture profile diffs with NO change to offerable.ts', () => {
    // The generic-diff guarantee, tested rather than asserted in a comment. The
    // field below exists nowhere in the schema; a hand-listed axis set could not
    // report it, and a reader of the picker would see the row with no variant.
    const active = {
      name: 'fixture-active',
      description: 'fixture',
      workflows: {
        verify: { oid4vp: { queryLanguage: 'dcql', somethingNew: 'old' } }
      }
    }
    const candidate = {
      ...active,
      name: 'fixture-candidate',
      workflows: {
        verify: { oid4vp: { queryLanguage: 'dcql', somethingNew: 'new' } }
      }
    }
    // Exercised through the same private walk the route uses, by way of a
    // profile pair — the module exports the set, not the walk, so this reaches
    // it the way production does.
    const diff = axisDiff(
      active.workflows.verify,
      candidate.workflows.verify
    )
    expect(diff).toEqual([{ field: 'somethingNew', value: 'new' }])
  })

  test('⚠️ the diff is against the profile resolved for THIS exchange, not a hardcoded name', async () => {
    // A deployment whose default is a VPR-differential profile must see its
    // alternatives diffed against THAT, not against the shipped default.
    activeProfileName = 'vcapi-vpr-bare-origin-domain'
    const presets = await fetchPresets(await createVerifyExchange())
    const backToDefault = presets.find(
      (p) => p.protocolProfileName === DEFAULT_PROFILE
    )!
    // Against the bare-origin profile, the default differs on `domainForm` — a
    // diff that would be EMPTY if the baseline were hardcoded to the default.
    expect(backToDefault.axes.map((a) => a.field)).toContain('domainForm')
    activeProfileName = DEFAULT_PROFILE
  })

  test('a preset states the axes its profile changes, in the schema’s own words', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    const bareOrigin = presets.find(
      (p) => p.protocolProfileName === 'vcapi-vpr-bare-origin-domain'
    )!
    expect(bareOrigin.axes).toEqual([
      { field: 'domainForm', value: 'exchange-host' }
    ])
  })
})

describe('offerable presets · product ids', () => {
  test('⚠️ empty for every shipped profile today, and honestly so', async () => {
    activeProfileName = DEFAULT_PROFILE
    const presets = await fetchPresets(await createVerifyExchange())
    expect(presets.every((p) => p.productIds.length === 0)).toBe(true)
  })

  test('a fixture product naming a profile makes it non-empty — the wiring is proven', async () => {
    // ⚠️ A fixture registry rather than the shipped table, so M6's mapping stays
    // honestly empty while what it CAN express is still asserted. Injected the
    // same way every other lookup in `lib/wallets` takes a registry.
    activeProfileName = DEFAULT_PROFILE
    const exchangeId = await createVerifyExchange()
    const exchange = await getExchangeData(exchangeId, 'verify')
    const fixture: Wallet[] = [
      {
        id: 'fixture-wallet',
        name: 'Fixture Wallet',
        protocolProfileName: DEFAULT_PROFILE,
        links: []
      }
    ]
    const presets = offerablePresets(exchange, config.getConfig(), fixture)
    const active = presets.find((p) => p.isDefault)!
    expect(active.productIds).toEqual(['fixture-wallet'])
  })
})
