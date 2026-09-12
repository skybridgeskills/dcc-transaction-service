/**
 * The protocols envelope: what keys go out, and the ones that must never leave.
 *
 * ⚠️ **Legacy protocol keys are KEPT, not renamed** — existing callers and test
 * cases name `iu`, `OID4VP` and `OID4VCI`, the interaction page's method picker
 * keys off them, and the `interaction-method-shown` journal line records them.
 * VCALM calls the unversioned OID4 spellings deprecated and *"indefinitely
 * retained ... for backwards compatibility"*; deleting them here would break
 * those callers and rename what the journal records, to chase a rename the spec
 * itself does not require.
 *
 * The tests below are named for the invariants rather than the functions, so a
 * later "cleanup" that removes a key fails with a sentence explaining why it
 * cannot.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'

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

afterAll(() => vi.restoreAllMocks())

const protocolsFor = async (
  workflow: 'claim' | 'didAuth' | 'verify'
): Promise<Record<string, unknown>> => {
  const variables: Record<string, unknown> = {
    exchangeHost: EXCHANGE_HOST,
    tenantName: 'default'
  }
  if (workflow === 'claim') {
    variables.vc = JSON.stringify({
      '@context': ['https://www.w3.org/2018/credentials/v1'],
      type: ['VerifiableCredential', 'OpenBadgeCredential'],
      credentialSubject: { type: ['AchievementSubject'] }
    })
    variables.retrievalId = 'envelope-test'
  }
  if (workflow === 'verify') {
    Object.assign(variables, {
      vprContext: [],
      vprCredentialType: ['OpenBadgeCredential'],
      trustedIssuers: [],
      vprClaims: []
    })
  }
  const response = await app.request(`/workflows/${workflow}/exchanges`, {
    method: 'POST',
    body: JSON.stringify({ variables }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  return (await response.json()) as Record<string, unknown>
}

describe('the legacy keys are kept — a cleanup that removes one fails here', () => {
  test('a verify exchange still carries `iu`, `vcapi`, `lcw` and `OID4VP`', async () => {
    const protocols = await protocolsFor('verify')

    expect(protocols.iu).toBeDefined()
    expect(protocols.vcapi).toBeDefined()
    expect(protocols.lcw).toBeDefined()
    expect(protocols.OID4VP).toBeDefined()
    expect(protocols.verifiablePresentationRequest).toBeDefined()
  })

  test('a claim exchange still carries `OID4VCI`', async () => {
    expect((await protocolsFor('claim')).OID4VCI).toBeDefined()
  })

  test('`lcw` is unchanged and still wallet-specific', async () => {
    // Not a VCALM protocol at all — a wallet-specific convenience riding in the
    // same object, grandfathered because callers read it.
    const protocols = await protocolsFor('verify')

    expect(protocols.lcw).toEqual(expect.stringContaining('lcw.app'))
  })
})

describe('the versioned VCALM spellings are emitted alongside', () => {
  test('`oid4vp-1.0` is present and BYTE-IDENTICAL to `OID4VP`', async () => {
    // Identical, not merely equivalent: adding a spelling must be additive, so
    // a wallet reading either finds the same URL. Two keys with two different
    // values would be two constructions wearing one name.
    const protocols = await protocolsFor('verify')

    expect(protocols['oid4vp-1.0']).toBe(protocols.OID4VP)
  })

  test('`oid4vci-1.0` is present and BYTE-IDENTICAL to `OID4VCI`', async () => {
    const protocols = await protocolsFor('claim')

    expect(protocols['oid4vci-1.0']).toBe(protocols.OID4VCI)
  })

  test('a didAuth exchange gets neither — it offers no OID4 construction', async () => {
    const protocols = await protocolsFor('didAuth')

    expect(protocols.OID4VP).toBeUndefined()
    expect(protocols['oid4vp-1.0']).toBeUndefined()
    expect(protocols.OID4VCI).toBeUndefined()
    expect(protocols['oid4vci-1.0']).toBeUndefined()
  })
})

describe('⚠️ `interact` is NOT emitted, and that is the decision', () => {
  test('no workflow puts our interaction URL under `interact`', async () => {
    // Read from the VCALM text, not inferred: `interact` is a DELEGATION
    // mechanism — "used to redirect a wallet to a different interaction URL,
    // where the exchange will continue". Our interaction URL is the thing whose
    // GET returns this map; emitting it under `interact` would tell a wallet to
    // go elsewhere and land it back here.
    for (const workflow of ['claim', 'didAuth', 'verify'] as const) {
      expect((await protocolsFor(workflow)).interact).toBeUndefined()
    }
  })
})
