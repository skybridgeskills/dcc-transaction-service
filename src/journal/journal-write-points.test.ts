/**
 * The journal's write points, exercised through the real code paths rather
 * than by calling the journal directly.
 *
 * Each of these is a place where a fact about an exchange exists for one
 * request and then stops existing. Testing them through the routes and the
 * persistence layer is the point: a unit test of `appendJournalEntry` would
 * still pass on the day someone rebuilt a handler and dropped the call.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import { app } from '../hono.js'
import * as config from '../config.js'
import { getWorkflow } from '../workflows.js'
import {
  createExchangeDidAuth,
  validateExchangeDidAuth
} from '../workflows/didAuthWorkflow.js'
import { saveExchange } from '../transactionManager.js'
import testVC from '../test-fixtures/testVC.js'
import { resetVerifier } from '../lib/verifier.js'
import { flushJournal, type JournalEntry } from './index.js'

const exchangeHost = 'http://localhost:4005'

let directory: string
let journalPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'exchange-journal-writes-'))
  journalPath = join(directory, 'journal.jsonl')
  vi.spyOn(axios, 'post').mockImplementation(() => Promise.resolve({ data: {} }))
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    statusService: '',
    tenantAuthenticationEnabled: false,
    exchangeJournalPath: journalPath
  }))
})

afterEach(async () => {
  vi.restoreAllMocks()
  // Drain before removing the directory. Appends are fire-and-forget by
  // design, so an in-flight write can land after `rm` and recreate the file —
  // which the next test then reads as its own output. Flaky roughly one run in
  // three without this.
  await flushJournal()
  await rm(directory, { recursive: true, force: true })
})

const readJournal = async (): Promise<JournalEntry[]> =>
  (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)

const linesFor = async (exchangeId: string) =>
  (await readJournal()).filter((entry) => entry.exchangeId === exchangeId)

const createClaimExchange = async (exchangeIdPrefix?: string) => {
  const response = await app.request('/workflows/claim/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      ...(exchangeIdPrefix ? { exchangeIdPrefix } : {}),
      variables: {
        tenantName: 'default',
        exchangeHost,
        vc: JSON.stringify(testVC)
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const { iu } = (await response.json()) as { iu: string }
  return new URL(iu).pathname.split('/').pop()!
}

/**
 * A verify exchange, created through the same VC-API route a caller uses.
 * Returns its exchangeId.
 */
const createVerifyExchange = async (
  variables: Record<string, unknown> = {}
) => {
  const response = await app.request('/workflows/verify/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: {
        tenantName: 'default',
        exchangeHost,
        vprContext: ['https://www.w3.org/2018/credentials/v1'],
        vprCredentialType: ['VerifiableCredential'],
        trustedIssuers: [],
        vprClaims: [],
        ...variables
      }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const { vcapi } = (await response.json()) as { vcapi: string }
  return new URL(vcapi).pathname.split('/exchanges/')[1]!.split('/')[0]!
}

/** Submit a presentation to a verify exchange over the VC-API arm. */
const submitToVerify = (
  exchangeId: string,
  body: unknown,
  headers: Record<string, string> = {}
) =>
  app.request(`/workflows/verify/exchanges/${exchangeId}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers }
  })

/**
 * A structurally complete VP whose single credential is not one. This is the
 * shape that hits `verifyWorkflow.ts:684` — `Invalid Verifiable Credential(s)`
 * — and that used to produce a journal containing only `mint`.
 */
const vpWithUnparseableCredential = {
  '@context': ['https://www.w3.org/2018/credentials/v1'],
  type: 'VerifiablePresentation',
  holder: 'did:key:z6MkholderExample',
  verifiableCredential: [{ notACredential: true }],
  proof: {
    type: 'Ed25519Signature2020',
    created: '2024-01-01T00:00:00Z',
    verificationMethod: 'did:key:z6MkholderExample#z6MkholderExample',
    proofPurpose: 'authentication',
    proofValue: 'zTestProofValue',
    challenge: 'test-challenge'
  }
}

/**
 * A VP that clears every structural check in `preparePresentationForVerify`,
 * so the request reaches the verifier rather than being rejected before it.
 */
const validVpShape = {
  ...vpWithUnparseableCredential,
  verifiableCredential: [testVC]
}

describe('mint', () => {
  test('every workflow journals a mint line at creation', async () => {
    const exchangeId = await createClaimExchange('p1')
    await flushJournal()

    const [mint] = await linesFor(exchangeId)
    expect(mint).toMatchObject({
      event: 'mint',
      workflowId: 'claim',
      tenantName: 'default',
      detail: { exchangeIdPrefix: 'p1' }
    })
    expect(mint!.detail!.expires).toEqual(expect.any(String))
  })

  test('an unprefixed mint records no prefix rather than an empty one', async () => {
    const exchangeId = await createClaimExchange()
    await flushJournal()

    const [mint] = await linesFor(exchangeId)
    expect(mint!.detail).not.toHaveProperty('exchangeIdPrefix')
  })
})

describe('discovery-served', () => {
  // Which well-known construction a wallet used is a fact about the wallet, and
  // it is otherwise visible only in stdout of a running process.
  test.each([
    [
      'rfc8414-path-suffix',
      'issuer',
      (id: string) =>
        `/.well-known/openid-credential-issuer/workflows/claim/exchanges/${id}`
    ],
    [
      'oidc-concat',
      'issuer',
      (id: string) =>
        `/workflows/claim/exchanges/${id}/.well-known/openid-credential-issuer`
    ],
    [
      'rfc8414-path-suffix',
      'as',
      (id: string) =>
        `/.well-known/oauth-authorization-server/workflows/claim/exchanges/${id}`
    ],
    [
      'oidc-concat',
      'openid-configuration',
      (id: string) =>
        `/workflows/claim/exchanges/${id}/.well-known/openid-configuration`
    ]
  ])(
    'records construction=%s doc=%s',
    async (construction, doc, path: (id: string) => string) => {
      const exchangeId = await createClaimExchange('p1')
      const response = await app.request(path(exchangeId))
      expect(response.status).toBe(200)
      await flushJournal()

      const discovery = (await linesFor(exchangeId)).filter(
        (entry) => entry.event === 'discovery-served'
      )
      expect(discovery).toHaveLength(1)
      expect(discovery[0]!.detail).toEqual({ construction, doc })
    }
  )

  test('carries the prefix on the line, so the caller’s concept needs no lookup', async () => {
    const exchangeId = await createClaimExchange('p9')
    await app.request(
      `/workflows/claim/exchanges/${exchangeId}/.well-known/openid-credential-issuer`
    )
    await flushJournal()

    const [discovery] = (await linesFor(exchangeId)).filter(
      (entry) => entry.event === 'discovery-served'
    )
    expect(discovery!.exchangeId.startsWith('p9-')).toBe(true)
  })
})

describe('accommodation-served', () => {
  // The `token-endpoint-by-convention` accommodation, and the reason it has a
  // write point at all: the fact it records — that a client constructed the
  // token URL rather than discovering it — lives on the wire for one request
  // and then nowhere. Without this line, recovering it depends on whether
  // someone happened to be capturing traffic at the time; the write point
  // replaces that with a durable record.
  const conventionalToken = (exchangeId: string) =>
    app.request(`/workflows/claim/exchanges/${exchangeId}/token`, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code' }),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'ExampleAgent/1.0'
      }
    })

  test('records the accommodation and who took it', async () => {
    const exchangeId = await createClaimExchange('p4')
    await conventionalToken(exchangeId)
    await flushJournal()

    const served = (await linesFor(exchangeId)).filter(
      (entry) => entry.event === 'accommodation-served'
    )
    expect(served).toHaveLength(1)
    expect(served[0]!.detail).toEqual({
      accommodation: 'token-endpoint-by-convention',
      endpoint: 'token',
      userAgent: 'ExampleAgent/1.0'
    })
  })

  // Written before the grant is judged. A client that constructed the URL and
  // then presented a bad code still constructed the URL — and that is the case
  // the accommodation exists for, so recording it only on success would lose
  // precisely the exchanges worth reading back.
  test('is written even when the token request is refused', async () => {
    const exchangeId = await createClaimExchange('p5')
    const response = await conventionalToken(exchangeId)
    expect(response.status).toBe(400)
    await flushJournal()

    expect(
      (await linesFor(exchangeId)).filter(
        (entry) => entry.event === 'accommodation-served'
      )
    ).toHaveLength(1)
  })

  // ⛔ The constraint that keeps serving the accommodation separate from
  // recording a discovery. Whatever reads `discovery-served` lines to tell
  // real discovery from a constructed guess relies on a client which
  // constructs this URL producing none. A route that marked itself as a
  // discovery would make the guess indistinguishable from the discovery it
  // replaced.
  test('writes no discovery-served line, so the absence survives', async () => {
    const exchangeId = await createClaimExchange('p6')
    await conventionalToken(exchangeId)
    await flushJournal()

    expect(
      (await linesFor(exchangeId)).filter(
        (entry) => entry.event === 'discovery-served'
      )
    ).toHaveLength(0)
  })

  // The discovered route is the strict one and is not an accommodation, so it
  // records nothing. Absence of the line means "the accommodated route was not
  // used" and never "we forgot to write it".
  test('the discovered token route records nothing', async () => {
    const exchangeId = await createClaimExchange('p7')
    await app.request(
      `/workflows/claim/exchanges/${exchangeId}/openid/token`,
      {
        method: 'POST',
        body: new URLSearchParams({ grant_type: 'authorization_code' }),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
    )
    await flushJournal()

    expect(
      (await linesFor(exchangeId)).filter(
        (entry) => entry.event === 'accommodation-served'
      )
    ).toHaveLength(0)
  })
})

describe('interaction-method-shown', () => {
  // Which interaction method a scan went through cannot be inferred from our
  // own wire: a by-value OID4VP request carries the whole authorization request
  // in the QR, so a scan that fails leaves nothing behind at all — and a scan
  // of the wrong interaction method goes unnoticed for exactly this reason.
  const postInteractionMethod = (exchangeId: string, body: unknown) =>
    app.request(`/interactions/${exchangeId}/method`, {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' }
    })

  test('the page reporting a payload journals the method it describes', async () => {
    const exchangeId = await createClaimExchange()
    const payload =
      'openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fx.example%2Fr' +
      '&request_uri=https%3A%2F%2Fx.example%2Frequest'

    const response = await postInteractionMethod(exchangeId, { payloadId: 'OID4VP', payload })
    expect(response.status).toBe(204)
    await flushJournal()

    const [method] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'interaction-method-shown'
    )
    expect(method).toMatchObject({
      event: 'interaction-method-shown',
      workflowId: 'claim',
      detail: {
        payloadId: 'OID4VP',
        scheme: 'openid4vp',
        clientId: 'redirect_uri:https://x.example/r',
        delivery: 'by-reference'
      }
    })
  })

  test('the raw payload is kept, not only the fields we derived from it', async () => {
    // An interaction method we described wrongly is precisely the case where
    // the bytes settle it.
    const exchangeId = await createClaimExchange()
    const payload = 'https://x.example/interactions/abc?payload=iu'
    await postInteractionMethod(exchangeId, { payloadId: 'iu', payload })
    await flushJournal()

    const [method] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'interaction-method-shown'
    )
    expect(method!.detail!.payload).toBe(payload)
  })

  test('candidate A and an OID4VP method are distinguishable on the line alone', async () => {
    const a = await createClaimExchange()
    const b = await createClaimExchange()
    await postInteractionMethod(a, { payloadId: 'iu', payload: 'https://x.example/interactions/a' })
    await postInteractionMethod(b, {
      payloadId: 'OID4VP',
      payload: 'openid4vp://?client_id=redirect_uri%3Ahttps%3A%2F%2Fx.example%2Fr'
    })
    await flushJournal()

    const scheme = async (id: string) =>
      (await linesFor(id)).find((l) => l.event === 'interaction-method-shown')!.detail!.scheme
    expect(await scheme(a)).toBe('https')
    expect(await scheme(b)).toBe('openid4vp')
  })

  test('a malformed report is refused and journals nothing', async () => {
    const exchangeId = await createClaimExchange()
    const response = await postInteractionMethod(exchangeId, { payloadId: 'OID4VP' })
    expect(response.status).toBe(400)
    await flushJournal()

    expect(
      (await linesFor(exchangeId)).filter((l) => l.event === 'interaction-method-shown')
    ).toHaveLength(0)
  })
})

describe('terminal', () => {
  const mintDidAuth = () =>
    createExchangeDidAuth({
      data: validateExchangeDidAuth({
        variables: { exchangeHost: 'http://localhost:4004' }
      }),
      config: config.getConfig(),
      workflow: getWorkflow('didAuth')!
    })

  test('a `complete` save produces a terminal line; a `pending` one does not', async () => {
    const minted = mintDidAuth()
    await saveExchange(minted)
    await saveExchange({ ...minted, state: 'complete' })
    await flushJournal()

    expect((await linesFor(minted.exchangeId)).map((e) => e.event)).toEqual([
      'mint',
      'terminal'
    ])
  })

  test('an `invalid` save produces a terminal line carrying the state', async () => {
    const minted = mintDidAuth()
    await saveExchange({ ...minted, state: 'invalid' })
    await flushJournal()

    const [, terminal] = await linesFor(minted.exchangeId)
    expect(terminal).toMatchObject({
      event: 'terminal',
      detail: { state: 'invalid' }
    })
  })

  test('`active` is not terminal — a verify exchange awaiting the async pass continues', async () => {
    const minted = mintDidAuth()
    await saveExchange({ ...minted, state: 'active' })
    await flushJournal()

    expect((await linesFor(minted.exchangeId)).map((e) => e.event)).toEqual([
      'mint'
    ])
  })
})

describe('request-served', () => {
  // The authorization-request fetch is the write point that names who fetched.
  // A non-browser `User-Agent`, and a forwarding header showing the request
  // reached us through a relay rather than direct from the device, are facts
  // about the client that live on the wire for one request and then nowhere —
  // so the line records them.
  const fetchRequestObject = (exchangeId: string, headers: Record<string, string> = {}) =>
    app.request(`/workflows/verify/exchanges/${exchangeId}/openid4vp/request`, {
      headers
    })

  test('serving the authorization request journals who fetched it', async () => {
    const exchangeId = await createVerifyExchange()
    const response = await fetchRequestObject(exchangeId, {
      'User-Agent': 'ExampleAgent/1.0',
      'X-Forwarded-For': '203.0.113.7'
    })
    expect(response.status).toBe(200)
    await flushJournal()

    const [served] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'request-served'
    )
    expect(served).toMatchObject({
      event: 'request-served',
      workflowId: 'verify',
      detail: {
        delivery: 'by-reference',
        userAgent: 'ExampleAgent/1.0',
        forwardedFor: '203.0.113.7'
      }
    })
  })

  test('names its arm on the line, because the by-value arm issues no fetch', async () => {
    // An absent `request-served` line is ambiguous on its own — it means either
    // the wallet never fetched, or this arm has no fetch to make. The line says
    // which arm it belongs to so a reader never has to guess.
    const exchangeId = await createVerifyExchange()
    await fetchRequestObject(exchangeId)
    await flushJournal()

    const [served] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'request-served'
    )
    expect(served!.detail!.delivery).toBe('by-reference')
  })

  test('a by-value exchange records its delivery on `mint`, where a reader can find it', async () => {
    // By value there is no `.../openid4vp/request` GET at all, so `mint` and the
    // response POST are the only service-side write points there are.
    const exchangeId = await createVerifyExchange({ oid4vpDelivery: 'by-value' })
    await flushJournal()

    const [mint] = await linesFor(exchangeId)
    expect(mint).toMatchObject({
      event: 'mint',
      detail: { delivery: 'by-value' }
    })
  })

  test('a missing header is omitted, not written as an empty field', async () => {
    const exchangeId = await createVerifyExchange()
    await fetchRequestObject(exchangeId, { 'User-Agent': 'agent/1' })
    await flushJournal()

    const [served] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'request-served'
    )
    expect(served!.detail).not.toHaveProperty('forwardedFor')
    expect(served!.detail).not.toHaveProperty('referer')
  })

  test('an Authorization header is never carried onto the line', async () => {
    // The journal has no TTL and is never truncated. `redact.ts` is the
    // backstop, not the filter — a writer names what it keeps.
    const exchangeId = await createVerifyExchange()
    await fetchRequestObject(exchangeId, {
      'User-Agent': 'agent/1',
      Authorization: 'Bearer sk-live-do-not-journal-this'
    })
    await flushJournal()

    expect(await readFile(journalPath, 'utf8')).not.toContain(
      'sk-live-do-not-journal-this'
    )
  })
})

describe('submission', () => {
  // Three `throw HTTPException(400)` sites in `preparePresentationForVerify`
  // end the request without ever reaching `saveExchange`, which is what writes
  // `terminal`. A submission hitting the third of them left a journal
  // containing `mint` and nothing else — the only surviving account would be
  // whatever the client itself logged, which inverts the evidence model.
  test('a rejected presentation is journalled as a rejection, not as silence', async () => {
    const exchangeId = await createVerifyExchange()
    const response = await submitToVerify(
      exchangeId,
      vpWithUnparseableCredential
    )
    expect(response.status).toBe(400)
    await flushJournal()

    const events = (await linesFor(exchangeId)).map((l) => l.event)
    expect(events).toEqual(['mint', 'submission', 'error'])
  })

  test('the rejection carries the problem details the wallet was told', async () => {
    // The wire code says only that we refused. The reason is what a later
    // reader has to attribute, and it exists nowhere else once the record is
    // evicted.
    const exchangeId = await createVerifyExchange()
    await submitToVerify(exchangeId, vpWithUnparseableCredential)
    await flushJournal()

    const [rejection] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'error'
    )
    expect(rejection).toMatchObject({
      detail: {
        stage: 'vc-api-participate',
        reason: 'participation-rejected',
        status: 400,
        message: 'Invalid Verifiable Credential(s)'
      }
    })
    expect(rejection!.detail!.problemDetails).toEqual(expect.any(Array))
  })

  test('a VP with no holder is journalled too — every structural site, not one', async () => {
    const exchangeId = await createVerifyExchange()
    const { holder: _holder, ...withoutHolder } = vpWithUnparseableCredential
    const response = await submitToVerify(exchangeId, withoutHolder)
    expect(response.status).toBe(400)
    await flushJournal()

    const [rejection] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'error'
    )
    expect(rejection!.detail!.message).toBe('holder is required for verification')
  })

  test('the submission line carries who submitted', async () => {
    const exchangeId = await createVerifyExchange()
    await submitToVerify(exchangeId, vpWithUnparseableCredential, {
      'User-Agent': 'ExampleWallet/1.0 (Native)'
    })
    await flushJournal()

    const [submission] = (await linesFor(exchangeId)).filter(
      (l) => l.event === 'submission'
    )
    expect(submission!.detail).toMatchObject({
      arm: 'vc-api',
      userAgent: 'ExampleWallet/1.0 (Native)'
    })
  })

  test('an empty body is the exchange’s first step, not a submission', async () => {
    // Counting these as submissions would make the count of submissions — the
    // field a reader reaches for first — mean nothing.
    const exchangeId = await createVerifyExchange()
    await submitToVerify(exchangeId, {})
    await flushJournal()

    expect(
      (await linesFor(exchangeId)).filter((l) => l.event === 'submission')
    ).toHaveLength(0)
  })
})

describe('the write-point invariant', () => {
  /**
   * **Whatever ends the request ends it in the journal too.**
   *
   * This is the third journal gap of this family, and the previous two were
   * closed structurally rather than by patching the sites that happened to be
   * known. Asserting the invariant — rather than each site — is what makes a
   * fourth gap fail here instead of being discovered in a live run.
   */
  const outcomeFollowsEverySubmission = (entries: JournalEntry[]) => {
    const submissions = entries.filter((e) => e.event === 'submission')
    return submissions.every((submission) => {
      const after = entries.slice(entries.indexOf(submission) + 1)
      return after.some((e) => e.event === 'error' || e.event === 'terminal')
    })
  }

  test('a rejected submission is followed by an outcome line', async () => {
    const exchangeId = await createVerifyExchange()
    await submitToVerify(exchangeId, vpWithUnparseableCredential)
    await flushJournal()

    const entries = await linesFor(exchangeId)
    expect(entries.filter((e) => e.event === 'submission')).toHaveLength(1)
    expect(outcomeFollowsEverySubmission(entries)).toBe(true)
  })

  test('an unexpected failure is recorded too, not only a 400', async () => {
    // `handleErrors` renders an unexpected throw as a generic
    // `500 An unexpected error occurred` whose body deliberately says nothing.
    // If the journal also says nothing, the cause exists only in the stdout of
    // a process that has since exited — the same shape as the status-service
    // 409 collapsing into a 500, which is what the `error` event was added for.
    const exchangeId = await createVerifyExchange()
    resetVerifier({
      verifyPresentation: () => {
        throw new Error('verifier-core exploded')
      }
    } as unknown as Parameters<typeof resetVerifier>[0])

    const response = await submitToVerify(exchangeId, validVpShape)
    expect(response.status).toBe(500)
    await flushJournal()

    const entries = await linesFor(exchangeId)
    expect(entries.map((e) => e.event)).toEqual(['mint', 'submission', 'error'])
    expect(entries.at(-1)!.detail).toMatchObject({
      stage: 'vc-api-participate',
      reason: 'participation-failed',
      status: 500
    })
    // The redactor flattens `Error` instances rather than serialising them as
    // `{}`, so the cause survives rather than the mere fact of a failure.
    expect(JSON.stringify(entries.at(-1)!.detail)).toContain(
      'verifier-core exploded'
    )
  })
})
