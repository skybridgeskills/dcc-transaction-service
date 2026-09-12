/**
 * The journal's redaction rule is narrow by decision: it keeps request and
 * response bodies, credential contents and error payloads, because a record
 * that cannot attribute a failure to a cause is not worth keeping. The single
 * hard redaction is `Authorization` bearer tokens.
 *
 * These tests pin both halves of "narrow": that the credential goes, and that
 * nothing else does. The second half matters as much as the first — a redactor
 * that quietly grows will hollow out the journal without anyone noticing until
 * they need it.
 */
import { describe, expect, test } from 'vitest'
import { REDACTED, redactBearerTokens, redactJournalDetail } from './redact.js'

describe('redactBearerTokens', () => {
  test('replaces the token and keeps the scheme word', () => {
    expect(redactBearerTokens('Bearer abc123.def-456_ghi')).toBe(
      `Bearer ${REDACTED}`
    )
  })

  test('redacts a token embedded in surrounding prose', () => {
    expect(
      redactBearerTokens(
        'Request failed with headers {Authorization: Bearer sk-live-9f2c} at allocate'
      )
    ).toBe(
      `Request failed with headers {Authorization: Bearer ${REDACTED}} at allocate`
    )
  })

  test('is case-insensitive on the scheme and preserves the original casing', () => {
    expect(redactBearerTokens('bearer abc123')).toBe(`bearer ${REDACTED}`)
    expect(redactBearerTokens('BEARER abc123')).toBe(`BEARER ${REDACTED}`)
  })

  test('redacts every occurrence, not just the first', () => {
    expect(redactBearerTokens('Bearer aaa then Bearer bbb')).toBe(
      `Bearer ${REDACTED} then Bearer ${REDACTED}`
    )
  })

  test('over-redacts prose after the scheme word, on purpose', () => {
    // No length or entropy floor: the rule fails towards redaction, because a
    // false positive costs one word of prose and a false negative writes a
    // live credential into a file with no TTL that is never truncated.
    expect(redactBearerTokens('the bearer of this credential')).toBe(
      `the bearer ${REDACTED} this credential`
    )
  })

  test('leaves a string with no scheme word untouched', () => {
    expect(redactBearerTokens('allocate returned 409 for urn:uuid:9f2c')).toBe(
      'allocate returned 409 for urn:uuid:9f2c'
    )
  })
})

describe('redactJournalDetail', () => {
  test('redacts an Authorization header value whole, at any depth', () => {
    const detail = {
      request: {
        url: 'http://status/credentials/status/allocate',
        headers: { Authorization: 'Bearer sk-live-9f2c', 'content-type': 'application/json' }
      }
    }
    expect(redactJournalDetail(detail)).toEqual({
      request: {
        url: 'http://status/credentials/status/allocate',
        headers: { Authorization: REDACTED, 'content-type': 'application/json' }
      }
    })
  })

  test('matches the header name case-insensitively, including proxy-authorization', () => {
    expect(
      redactJournalDetail({
        authorization: 'Basic dXNlcjpwYXNz',
        'Proxy-Authorization': 'Bearer nope'
      })
    ).toEqual({
      authorization: REDACTED,
      'Proxy-Authorization': REDACTED
    })
  })

  test('keeps credential contents — the journal is fixture data and attribution needs them', () => {
    const detail = {
      credential: {
        id: 'urn:uuid:9f2c8b1e-0a1b-4c2d-8e3f-0a1b2c3d4e5f',
        credentialSubject: { id: 'did:key:z6Mk…', achievement: { name: 'Skills' } }
      },
      upstreamStatus: 409
    }
    expect(redactJournalDetail(detail)).toEqual(detail)
  })

  test('does not mutate the caller’s object', () => {
    const headers = { Authorization: 'Bearer sk-live-9f2c' }
    redactJournalDetail({ headers })
    expect(headers.Authorization).toBe('Bearer sk-live-9f2c')
  })

  test('walks arrays', () => {
    expect(
      redactJournalDetail({ attempts: [{ Authorization: 'Bearer a' }, 'Bearer b'] })
    ).toEqual({ attempts: [{ Authorization: REDACTED }, `Bearer ${REDACTED}`] })
  })

  test('survives a cyclic payload — axios errors reference their own config', () => {
    const cyclic: Record<string, unknown> = { name: 'AxiosError' }
    cyclic.self = cyclic
    expect(redactJournalDetail(cyclic)).toEqual({
      name: 'AxiosError',
      self: '[Circular]'
    })
  })

  test('a shared reference is not a cycle, and is written out at both paths', () => {
    // An upstream failure carries its problem details twice — on their own and
    // inside the response body it came in. Collapsing the second occurrence to
    // `[Circular]` would delete exactly the evidence the line was written for.
    const problemDetails = [{ title: 'CREDENTIAL_ALREADY_ALLOCATED' }]
    expect(
      redactJournalDetail({ body: { problemDetails }, problemDetails })
    ).toEqual({
      body: { problemDetails: [{ title: 'CREDENTIAL_ALREADY_ALLOCATED' }] },
      problemDetails: [{ title: 'CREDENTIAL_ALREADY_ALLOCATED' }]
    })
  })

  test('flattens Error instances, which JSON.stringify would render as {}', () => {
    const result = redactJournalDetail({
      cause: new Error('allocate failed: Bearer sk-live-9f2c rejected')
    }) as { cause: { name: string; message: string } }

    expect(result.cause.name).toBe('Error')
    expect(result.cause.message).toBe(`allocate failed: Bearer ${REDACTED} rejected`)
  })

  test('passes primitives through unchanged', () => {
    expect(redactJournalDetail({ n: 1, b: true, nil: null })).toEqual({
      n: 1,
      b: true,
      nil: null
    })
  })
})
