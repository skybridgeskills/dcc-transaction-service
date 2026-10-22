/**
 * The `bare-vp-participate-response` accommodation, exercised through the route.
 *
 * ⚠️ **The doorway URL is BUILT here, never mined out of a wallet link.** The
 * `lcw` link's `vc_request_url` points at this doorway on claim exchanges, but
 * reading the endpoint back out of the envelope would couple these cases to the
 * envelope rather than to the route — and would stop telling us the route works
 * on the day the envelope changed. See `docs/accommodations.md`.
 *
 * ⚠️ **Case 2 is not redundant with `app.test.ts`.** It asserts the strict body
 * on the SAME fixture and the SAME signed DID-auth as the bare one, so the pair
 * shows the two arms differ only in the envelope. The register's "the strict
 * alternative stays live" rule is what this pins.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios from 'axios'
import { app } from './hono.js'
import * as config from './config.js'
import { getSignedDIDAuth } from './didAuth.js'
import testVC from './test-fixtures/testVC.js'
import { flushJournal, type JournalEntry } from './journal/index.js'

const exchangeHost = 'http://localhost:4005'

let directory: string
let journalPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bare-vp-doorway-'))
  journalPath = join(directory, 'journal.jsonl')
  // The signing service is mocked to a bare `{}`: these cases are about the
  // ENVELOPE around the credential, not the credential, so the mocked value
  // travelling through as `verifiableCredential[0]` is exactly enough.
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
  // Drain before removing the directory — appends are fire-and-forget, so an
  // in-flight write can land after `rm` and recreate the file. Same reason as
  // `journal/journal-write-points.test.ts`.
  await flushJournal()
  await rm(directory, { recursive: true, force: true })
})

const linesFor = async (exchangeId: string): Promise<JournalEntry[]> =>
  (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
    .filter((entry) => entry.exchangeId === exchangeId)

/** A claim exchange, created through the VC-API route a caller uses. */
const createClaimExchange = async (): Promise<string> => {
  const response = await app.request('/workflows/claim/exchanges', {
    method: 'POST',
    body: JSON.stringify({
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

const createDidAuthExchange = async (): Promise<string> => {
  const response = await app.request('/workflows/didAuth/exchanges', {
    method: 'POST',
    body: JSON.stringify({
      variables: { tenantName: 'default', exchangeHost }
    }),
    headers: { 'Content-Type': 'application/json' }
  })
  expect(response.status).toBe(200)
  const { iu } = (await response.json()) as { iu: string }
  return new URL(iu).pathname.split('/').pop()!
}

/** The challenge and `domain` the exchange asks for, read off its own VPR. */
const vprFor = async (
  workflowId: string,
  exchangeId: string
): Promise<{ challenge: string; domain: string }> => {
  const response = await app.request(
    `/workflows/${workflowId}/exchanges/${exchangeId}`,
    { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } }
  )
  const body = (await response.json()) as {
    verifiablePresentationRequest: { challenge: string; domain: string }
  }
  return body.verifiablePresentationRequest
}

/** The challenge the exchange minted, read back off its own VPR. */
const challengeFor = async (
  workflowId: string,
  exchangeId: string
): Promise<string> => (await vprFor(workflowId, exchangeId)).challenge

const post = (path: string, body: unknown) =>
  app.request(path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' }
  })

const strictPath = (exchangeId: string) =>
  `/workflows/claim/exchanges/${exchangeId}`
const doorwayPath = (exchangeId: string) =>
  `/workflows/claim/exchanges/${exchangeId}/bare-vp`

describe('bare-vp participate doorway', () => {
  test('returns the presentation BARE', async () => {
    const exchangeId = await createClaimExchange()
    const challenge = await challengeFor('claim', exchangeId)
    const didAuth = await getSignedDIDAuth(challenge)

    const response = await post(doorwayPath(exchangeId), didAuth)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>

    // What LCW's `extractCredentialsFrom` reads: the TOP-LEVEL type.
    expect(body.type).toContain('VerifiablePresentation')
    expect(Array.isArray(body.verifiableCredential)).toBe(true)
    expect((body.verifiableCredential as unknown[]).length).toBe(1)

    // ⚠️ The old hybrid was a bare VP that ALSO carried a duplicated
    // `verifiablePresentation` member. This assertion is what stops it coming
    // back under a new name.
    expect(body.verifiablePresentation).toBeUndefined()
  })

  test('leaves the strict route returning the VC-API envelope', async () => {
    const exchangeId = await createClaimExchange()
    const { challenge, domain } = await vprFor('claim', exchangeId)
    const didAuth = await getSignedDIDAuth(challenge, undefined, domain)

    const response = await post(strictPath(exchangeId), didAuth)
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>

    expect(body.verifiablePresentation).toBeDefined()
    expect(body.type).toBeUndefined()
    expect(body.verifiableCredential).toBeUndefined()
  })

  test('journals accommodation-served ON ARRIVAL, before the DID-auth is judged', async () => {
    const exchangeId = await createClaimExchange()
    // Deliberately the WRONG challenge: the request fails, and the line must
    // still be there. A client that came in this door and then presented a bad
    // proof still came in this door.
    const didAuth = await getSignedDIDAuth('not-the-challenge')

    const response = await post(doorwayPath(exchangeId), didAuth)
    expect(response.status).toBe(401)

    await flushJournal()
    const served = (await linesFor(exchangeId)).filter(
      (entry) => entry.event === 'accommodation-served'
    )
    expect(served.length).toBe(1)
    expect(served[0]).toMatchObject({
      detail: {
        accommodation: 'bare-vp-participate-response',
        endpoint: 'participate'
      }
    })
  })

  test('journals submission too, on the same arm as the strict route', async () => {
    const exchangeId = await createClaimExchange()
    const { challenge, domain } = await vprFor('claim', exchangeId)
    const didAuth = await getSignedDIDAuth(challenge, undefined, domain)

    expect((await post(doorwayPath(exchangeId), didAuth)).status).toBe(200)

    await flushJournal()
    const lines = await linesFor(exchangeId)
    expect(
      lines.filter((entry) => entry.event === 'accommodation-served').length
    ).toBe(1)
    // ⚠️ `arm: 'vc-api'`, not a doorway-specific arm. The inbound DID-auth is
    // real and spec-shaped; `accommodation-served` already names the doorway,
    // and a second arm value would state the same fact twice.
    const submissions = lines.filter((entry) => entry.event === 'submission')
    expect(submissions.length).toBe(1)
    expect(submissions[0]).toMatchObject({ detail: { arm: 'vc-api' } })
  })

  test('writes no discovery event it stands in for', async () => {
    const exchangeId = await createClaimExchange()
    const challenge = await challengeFor('claim', exchangeId)
    const didAuth = await getSignedDIDAuth(challenge)

    expect((await post(doorwayPath(exchangeId), didAuth)).status).toBe(200)

    await flushJournal()
    const events = (await linesFor(exchangeId)).map((entry) => entry.event)
    expect(events).not.toContain('discovery-served')
  })

  /**
   * ⚠️ **The doorway's one stated exception.** LCW's legacy claim flow — the
   * client this doorway exists for — signs its DID-auth with the challenge and
   * NO `domain`. The doorway accepts that, and journals it; a proof that DOES
   * carry a `domain` must still match, and the strict route refuses a
   * domain-less proof outright. See `participateHandler` in `hono.ts`.
   */
  describe('domain', () => {
    const absentAcceptedLines = async (exchangeId: string) => {
      await flushJournal()
      return (await linesFor(exchangeId)).filter(
        (entry) =>
          entry.event === 'accommodation-served' &&
          (entry.detail as { accommodation?: string }).accommodation ===
            'bare-vp-domain-absent-accepted'
      )
    }

    test('a proof with no domain is accepted on the doorway, and journalled', async () => {
      const exchangeId = await createClaimExchange()
      const challenge = await challengeFor('claim', exchangeId)
      const didAuth = await getSignedDIDAuth(challenge)

      expect((await post(doorwayPath(exchangeId), didAuth)).status).toBe(200)
      expect(await absentAcceptedLines(exchangeId)).toHaveLength(1)
    })

    test('a proof with a wrong domain is refused on the doorway', async () => {
      const exchangeId = await createClaimExchange()
      const challenge = await challengeFor('claim', exchangeId)
      const didAuth = await getSignedDIDAuth(
        challenge,
        undefined,
        'https://elsewhere.example'
      )

      expect((await post(doorwayPath(exchangeId), didAuth)).status).toBe(401)
      expect(await absentAcceptedLines(exchangeId)).toHaveLength(0)
    })

    test('a proof with the right domain is accepted on the doorway, with no exception journalled', async () => {
      const exchangeId = await createClaimExchange()
      const { challenge, domain } = await vprFor('claim', exchangeId)
      const didAuth = await getSignedDIDAuth(challenge, undefined, domain)

      expect((await post(doorwayPath(exchangeId), didAuth)).status).toBe(200)
      expect(await absentAcceptedLines(exchangeId)).toHaveLength(0)
    })

    test('the same domain-less proof is refused on the strict route', async () => {
      const exchangeId = await createClaimExchange()
      const challenge = await challengeFor('claim', exchangeId)
      const didAuth = await getSignedDIDAuth(challenge)

      expect((await post(strictPath(exchangeId), didAuth)).status).toBe(401)
    })
  })

  test('refuses a non-claim workflow', async () => {
    const exchangeId = await createDidAuthExchange()
    const challenge = await challengeFor('didAuth', exchangeId)
    const didAuth = await getSignedDIDAuth(challenge)

    const response = await post(
      `/workflows/didAuth/exchanges/${exchangeId}/bare-vp`,
      didAuth
    )
    expect(response.status).toBe(400)
  })

  test('passes a non-envelope body through untouched', async () => {
    const exchangeId = await createClaimExchange()

    // The initial step of an exchange: an empty body returns the VPR, which is
    // not a participation envelope and must not be unwrapped.
    const response = await post(doorwayPath(exchangeId), {})
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.verifiablePresentationRequest).toBeDefined()
  })
})
