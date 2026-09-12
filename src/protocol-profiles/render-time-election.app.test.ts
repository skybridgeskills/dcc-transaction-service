/**
 * Render-time protocol profile election, asserted on the WIRE.
 *
 * ⚠️ **Every assertion here is on served bytes**, not on a builder's return
 * value. A test that asserted the builder would pass while a route read the
 * wrong exchange — which is the entire defect this phase exists to prevent, and
 * it lives in the routes rather than in the resolvers.
 *
 * ⚠️ **The inert-on-default case is the load-bearing one.** `?protocolProfile=`
 * naming the construction the exchange already serves must produce the same
 * bytes as no parameter at all. It is asserted by fetching the SAME exchange
 * twice and comparing the raw response text — no normalisation, nothing to get
 * wrong about which of the two runs minted which `state`.
 */
import { describe, expect, test, beforeAll, afterAll, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import { getExchangeData } from '../transactionManager.js'
import { flushJournal, type JournalEntry } from '../journal/index.js'
import {
  ELECTION_BOUND_AXIS_FIELDS,
  OID4VP_AXIS_SCOPE
} from './election.js'
import { oid4vpProfileFieldsSchema } from './schema.js'

const EXCHANGE_HOST = 'http://localhost:4005'

/** The default construction. */
const DEFAULT_PROFILE = 'oid4vp-1.0-json-by-reference-dcql-redirect-uri'
const PEX_PROFILE = 'oid4vp-1.0-json-by-reference-pex-redirect-uri'
const BY_VALUE_PROFILE = 'oid4vp-1.0-by-value-dcql-redirect-uri'
const VPR_PROFILE = 'vcapi-vpr-bare-origin-domain'

let journalDirectory: string
let journalPath: string

beforeAll(async () => {
  journalDirectory = await mkdtemp(join(tmpdir(), 'election-app-'))
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
  await flushJournal()
  vi.restoreAllMocks()
  await rm(journalDirectory, { recursive: true, force: true })
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

/** The `request_uri` response, as text, with an optional election. */
const fetchRequest = async (
  exchangeId: string,
  elected?: string
): Promise<{ status: number; body: string; contentType: string }> => {
  const query = elected
    ? `?protocolProfile=${encodeURIComponent(elected)}`
    : ''
  const response = await app.request(
    `/workflows/verify/exchanges/${exchangeId}/openid4vp/request${query}`
  )
  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get('content-type') ?? ''
  }
}

/** The interaction URL's JSON envelope, as text, with an optional election. */
const fetchInteraction = async (
  exchangeId: string,
  elected?: string
): Promise<{ status: number; body: string }> => {
  const query = elected
    ? `?protocolProfile=${encodeURIComponent(elected)}`
    : ''
  const response = await app.request(`/interactions/${exchangeId}${query}`, {
    headers: { Accept: 'application/json' }
  })
  return { status: response.status, body: await response.text() }
}

const linesFor = async (exchangeId: string): Promise<JournalEntry[]> => {
  await flushJournal()
  return (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
    .filter((entry) => entry.exchangeId === exchangeId)
}

describe('render-time election · the parameter is inert on the default', () => {
  test('pinning the default profile serves the request_uri bytes unchanged', async () => {
    const exchangeId = await createVerifyExchange()
    const unpinned = await fetchRequest(exchangeId)
    const pinned = await fetchRequest(exchangeId, DEFAULT_PROFILE)

    expect(unpinned.status).toBe(200)
    expect(pinned.status).toBe(200)
    // ⚠️ Same exchange, so the `state` and `nonce` are the same tokens and the
    // comparison is literal. Nothing is normalised away.
    expect(pinned.body).toBe(unpinned.body)
    expect(pinned.contentType).toBe(unpinned.contentType)
  })

  test('pinning the default profile serves the interaction envelope unchanged', async () => {
    const exchangeId = await createVerifyExchange()
    const unpinned = await fetchInteraction(exchangeId)
    const pinned = await fetchInteraction(exchangeId, DEFAULT_PROFILE)

    expect(unpinned.status).toBe(200)
    expect(pinned.status).toBe(200)
    expect(pinned.body).toBe(unpinned.body)
  })
})

/**
 * ⚠️ **Only the interaction-URL interaction method has an electable alternative
 * to show.** Every registered profile either differs from the default on a
 * mint-bound axis (`delivery`, `queryLanguage`, `clientIdPrefix`) or changes
 * only the VPR, so no registered profile changes an OID4VP byte under an
 * election. The `request_uri` half of this claim is therefore exercised by the
 * inertness tests above and by the refusals below, and the positive case lives
 * on the interaction method that has one. ⚠️ A future profile that varies a
 * request-scoped OID4VP axis should bring a positive case here.
 */
describe('render-time election · a pinned profile changes the bytes it states', () => {
  test('electing a VPR-differential profile changes the interaction URL method', async () => {
    const exchangeId = await createVerifyExchange()
    const unpinned = JSON.parse((await fetchInteraction(exchangeId)).body) as {
      protocols: { verifiablePresentationRequest: { domain: string } }
    }
    const pinned = JSON.parse(
      (await fetchInteraction(exchangeId, VPR_PROFILE)).body
    ) as {
      protocols: { verifiablePresentationRequest: { domain: string } }
    }

    // ⚠️ This interaction method is the ONLY way the VPR-differential profiles
    // are selectable: they change no OID4VP byte, so on the `openid4vp://`
    // interaction method they are the default construction.
    expect(unpinned.protocols.verifiablePresentationRequest.domain).not.toBe(
      pinned.protocols.verifiablePresentationRequest.domain
    )
    expect(pinned.protocols.verifiablePresentationRequest.domain).toBe(
      EXCHANGE_HOST
    )
  })
})

describe('render-time election · the refusals', () => {
  test('an unknown profile name is a 400 that names the registered profiles', async () => {
    const exchangeId = await createVerifyExchange()
    const response = await fetchRequest(exchangeId, 'no-such-profile')
    expect(response.status).toBe(400)
    expect(response.body).toContain('Unknown protocol profile')
    expect(response.body).toContain(DEFAULT_PROFILE)
  })

  test('a by-value profile is a 400 that says why, without reaching the state guard', async () => {
    const exchangeId = await createVerifyExchange()
    const response = await fetchRequest(exchangeId, BY_VALUE_PROFILE)
    expect(response.status).toBe(400)
    expect(response.body).toContain('By-value profiles are mint-bound')
    // ⚠️ `getProtocols`'s by-value guard was NOT reached. Its message is the
    // one thing this assertion is looking for the absence of — a refusal that
    // arrived there would be a 500 about a missing `oid4vp.state`.
    expect(response.body).not.toContain('created outside createExchangeVerify')
  })

  test('a by-value profile is refused on the interaction method too', async () => {
    const exchangeId = await createVerifyExchange()
    const response = await fetchInteraction(exchangeId, BY_VALUE_PROFILE)
    expect(response.status).toBe(400)
    expect(response.body).toContain('By-value profiles are mint-bound')
  })

  test('⚠️ a mint-bound axis is a 409 naming the axis and who reads it', async () => {
    // PEX is not a render-time choice. The response leg parses the `vp_token`
    // in the language THIS EXCHANGE asked in, so serving PEX under an election
    // would produce a submission this service then rejects in its own
    // vocabulary — a false negative recorded against a wallet.
    const exchangeId = await createVerifyExchange()
    const response = await fetchRequest(exchangeId, PEX_PROFILE)
    expect(response.status).toBe(409)
    expect(response.body).toContain('queryLanguage')
    expect(response.body).toContain('response-handler.ts')
    expect(response.body).toContain('mint-bound')
  })

  // ⚠️ **`accepts`-not-equals has no positive case here, because no registered
  // profile states `queryLanguage: 'both'`.** The case it wants is a profile
  // serving both queries, elected off a DCQL exchange: served both, answerable
  // in DCQL, therefore honourable. `both` is a legal profile value and
  // `election.ts` documents why the rule must not be equality — so add this
  // case with the next profile that serves both queries rather than reaching
  // for equality because nothing exercises it.

  test('⚠️ an exchange that named its own profile refuses an election', async () => {
    // The same intent as the knob refusal, in the newer vocabulary. A test
    // case citing this name is citing this construction; one fetch served under
    // something else would change the construction under a live exchange.
    const exchangeId = await createVerifyExchange({
      protocolProfileName: PEX_PROFILE
    })
    const response = await fetchRequest(exchangeId, VPR_PROFILE)
    expect(response.status).toBe(409)
    expect(response.body).toContain(PEX_PROFILE)
    expect(response.body).toContain('what this exchange IS')
  })

  test('⚠️ naming the profile the exchange already asks for is inert, not refused', async () => {
    const exchangeId = await createVerifyExchange({
      protocolProfileName: PEX_PROFILE
    })
    const unpinned = await fetchRequest(exchangeId)
    const pinned = await fetchRequest(exchangeId, PEX_PROFILE)
    expect(pinned.status).toBe(200)
    expect(pinned.body).toBe(unpinned.body)
  })

  test('a knob-bearing exchange is a 409 that names the knob', async () => {
    const exchangeId = await createVerifyExchange({
      oid4vpQueryLanguage: 'pex'
    })
    const response = await fetchRequest(exchangeId, VPR_PROFILE)
    expect(response.status).toBe(409)
    expect(response.body).toContain('oid4vpQueryLanguage')
    expect(response.body).toContain(exchangeId)
  })
})

describe('render-time election · nothing is persisted', () => {
  test('the exchange record is unchanged after a pinned fetch', async () => {
    const exchangeId = await createVerifyExchange()
    await fetchRequest(exchangeId, PEX_PROFILE)
    await fetchInteraction(exchangeId, VPR_PROFILE)

    const record = (await getExchangeData(
      exchangeId,
      'verify'
    )) as App.ExchangeDetailVerify
    // ⚠️ The observation-only rule as a test. An election changes the bytes of
    // one request and changes nothing about the exchange.
    expect(record.variables.protocolProfileName).toBeUndefined()
    // ⚠️ And the stamp still records this exchange's OWN construction. The
    // elected copy drops the stamp for the request it builds; the record keeps
    // it, because the record is not about that request.
    expect(record.variables.oid4vp?.queryLanguage).toBe('dcql')
  })
})

describe('render-time election · request-served reports the elected profile', () => {
  test('the journal line carries the elected name', async () => {
    const exchangeId = await createVerifyExchange()
    await fetchRequest(exchangeId, VPR_PROFILE)

    const served = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'request-served'
    )
    expect(served).toHaveLength(1)
    const detail = served[0]!.detail as Record<string, unknown>
    // ⚠️ The ELECTED profile, read off the request-scoped copy. Left reading the
    // active one, this line would attribute every pinned fetch to whatever the
    // deployment's default happens to be.
    expect(detail.protocolProfileName).toBe(VPR_PROFILE)
    // ⚠️ **No electable profile changes `requestObjectFormat`**, so this cannot
    // assert a DIFFERENT envelope beside the elected name to prove the two are
    // read from the same copy. The envelope here is the exchange's own — which
    // is still the value the elected copy reports.
    expect(detail.requestObjectFormat).toBe('json')
  })

  test('an unpinned fetch names no profile, because no layer does', async () => {
    const exchangeId = await createVerifyExchange()
    await fetchRequest(exchangeId)
    const served = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'request-served'
    )
    const detail = served[0]!.detail as Record<string, unknown>
    expect(detail.protocolProfileName).toBeUndefined()
    expect(detail.requestObjectFormat).toBe('json')
  })
})

/**
 * ⚠️ **The classification must be TOTAL.** A hand-listed set of "axes that
 * matter" is the failure M1's audit found — 17 profile fields stated and read by
 * nothing — with a refusal attached instead of a UI. This is the guard that a
 * new OID4VP field cannot be added without somebody deciding whether an election
 * may change it.
 */
describe('render-time election · the axis classification is total', () => {
  test('every OID4VP profile field is classified', () => {
    const schemaFields = Object.keys(oid4vpProfileFieldsSchema.shape).sort()
    expect(Object.keys(OID4VP_AXIS_SCOPE).sort()).toEqual(schemaFields)
  })

  test('⚠️ every exchange-scoped field is actually checked', () => {
    // A field classified `exchange` but absent from the refusal loop would be
    // silently unenforced — classified as mint-bound and elected anyway.
    const classified = Object.entries(OID4VP_AXIS_SCOPE)
      .filter(([, scope]) => scope === 'exchange')
      .map(([field]) => field)
      .sort()
    expect(ELECTION_BOUND_AXIS_FIELDS.slice().sort()).toEqual(classified)
  })
})
