/**
 * Tests for the upstream-call wrapper.
 *
 * The property under test is the one the incident turned on: an upstream that
 * stated exactly why it refused must not have that statement discarded. Both
 * halves are asserted — what the journal keeps, and what the caller is allowed
 * to see — because they are deliberately different.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import axios, { AxiosError, AxiosHeaders } from 'axios'
import { HTTPException } from 'hono/http-exception'
import * as config from '../config.js'
import { flushJournal, REDACTED, type JournalEntry } from '../journal/index.js'
import { callUpstreamService } from './upstream-call.js'

const exchange: Pick<
  App.ExchangeDetailBase,
  'exchangeId' | 'workflowId' | 'tenantName'
> = {
  exchangeId: 'p1-abc',
  workflowId: 'claim',
  tenantName: 'default'
}

const ALLOCATE = 'http://status.example/credentials/status/allocate'

let directory: string
let journalPath: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'upstream-call-'))
  journalPath = join(directory, 'journal.jsonl')
  const current = config.getConfig()
  vi.spyOn(config, 'getConfig').mockImplementation(() => ({
    ...current,
    exchangeJournalPath: journalPath
  }))
})

afterEach(async () => {
  await flushJournal()
  vi.restoreAllMocks()
  await rm(directory, { recursive: true, force: true })
})

const journalled = async (): Promise<JournalEntry[]> => {
  await flushJournal()
  return (await readFile(journalPath, 'utf8'))
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as JournalEntry)
}

/** An axios rejection carrying an upstream HTTP response, as axios builds one. */
const rejectWith = (status: number, data: unknown, statusText = '') => {
  const headers = new AxiosHeaders()
  const requestConfig = { headers }
  vi.spyOn(axios, 'post').mockRejectedValue(
    new AxiosError(
      `Request failed with status code ${status}`,
      AxiosError.ERR_BAD_REQUEST,
      requestConfig,
      {},
      { status, statusText, data, headers, config: requestConfig }
    )
  )
}

const alreadyAllocated = {
  code: 409,
  message: 'Credential already allocated a status index.',
  problemDetails: [
    {
      type: 'https://www.w3.org/TR/vc-data-model#CREDENTIAL_ALREADY_ALLOCATED',
      status: 409,
      title: 'CREDENTIAL_ALREADY_ALLOCATED',
      detail: 'urn:uuid:fixed-id already has a status list index.'
    }
  ]
}

const call = () =>
  callUpstreamService<App.Credential>({
    exchange,
    stage: 'status-allocate',
    endpoint: ALLOCATE,
    body: { id: 'urn:uuid:fixed-id' } as unknown as Record<string, unknown>,
    headers: { Authorization: 'Bearer s3cret-status-token' }
  })

describe('callUpstreamService · the successful path is untouched', () => {
  test('returns the upstream body and journals nothing', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { id: 'allocated' } })

    expect(await call()).toEqual({ id: 'allocated' })
    await flushJournal()
    await expect(readFile(journalPath, 'utf8')).rejects.toThrow()
  })
})

describe('callUpstreamService · a stated refusal reaches the caller', () => {
  test('a 409 with problem details becomes a 409 with problem details', async () => {
    // The incident: this arrived as `{"code":500,"message":"An unexpected
    // error occurred"}` and was read as a status-list bug for weeks.
    rejectWith(409, alreadyAllocated, 'Conflict')

    const thrown = await call().catch((e: unknown) => e)
    expect(thrown).toBeInstanceOf(HTTPException)
    const exception = thrown as HTTPException
    expect(exception.status).toBe(409)
    expect(exception.message).toBe(alreadyAllocated.message)
    // `handleErrors` reads exactly this shape off the cause.
    expect(exception.cause).toEqual({
      problemDetails: alreadyAllocated.problemDetails
    })
  })

  test('the cause is journalled with the upstream status and body verbatim', async () => {
    rejectWith(409, alreadyAllocated, 'Conflict')
    await call().catch(() => undefined)

    const [entry] = await journalled()
    expect(entry).toMatchObject({
      exchangeId: 'p1-abc',
      event: 'error',
      detail: {
        stage: 'status-allocate',
        endpoint: ALLOCATE,
        status: 409,
        statusText: 'Conflict',
        body: alreadyAllocated,
        problemDetails: alreadyAllocated.problemDetails
      }
    })
  })

  test('a bearer token quoted back by the upstream does not reach the journal', async () => {
    // The body is journalled verbatim, and an upstream that echoes the request
    // it refused echoes our live status-service token with it. Redaction is
    // central and automatic; this pins it on the one path that actually
    // carries a credential into a file with no TTL.
    rejectWith(
      409,
      {
        ...alreadyAllocated,
        request: { headers: { Authorization: 'Bearer s3cret-status-token' } }
      },
      'Conflict'
    )
    await call().catch(() => undefined)
    await flushJournal()

    const written = await readFile(journalPath, 'utf8')
    expect(written).not.toContain('s3cret-status-token')
    expect(written).toContain(REDACTED)
  })
})

describe('callUpstreamService · what is NOT forwarded', () => {
  test('an upstream 401 stays a generic failure — it is about us, not the caller', async () => {
    rejectWith(401, { message: 'Unauthorized' })

    const thrown = await call().catch((e: unknown) => e)
    expect(thrown).not.toBeInstanceOf(HTTPException)
    expect(axios.isAxiosError(thrown)).toBe(true)
    // …but the deployment fault is still legible afterwards.
    expect((await journalled())[0]!.detail).toMatchObject({ status: 401 })
  })

  test('a refusal with no problem details keeps travelling as itself', async () => {
    rejectWith(400, 'plain text, no envelope')

    const thrown = await call().catch((e: unknown) => e)
    expect(thrown).not.toBeInstanceOf(HTTPException)
    expect((await journalled())[0]!.detail).toMatchObject({
      status: 400,
      body: 'plain text, no envelope'
    })
  })

  test('an upstream 500 is not dressed up as a client error', async () => {
    rejectWith(500, { message: 'boom', problemDetails: [] })

    const thrown = await call().catch((e: unknown) => e)
    expect(thrown).not.toBeInstanceOf(HTTPException)
  })

  test('a transport failure journals the axios code and rethrows', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(
      new AxiosError('connect ECONNREFUSED', 'ECONNREFUSED')
    )

    await expect(call()).rejects.toThrow('connect ECONNREFUSED')
    expect((await journalled())[0]!.detail).toMatchObject({
      stage: 'status-allocate',
      code: 'ECONNREFUSED'
    })
  })

  test('a non-axios throw is still journalled against the exchange', async () => {
    vi.spyOn(axios, 'post').mockRejectedValue(new Error('something else'))

    await expect(call()).rejects.toThrow('something else')
    expect((await journalled())[0]!.detail).toMatchObject({
      message: 'something else'
    })
  })
})
