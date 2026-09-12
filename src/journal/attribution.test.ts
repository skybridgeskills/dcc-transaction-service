/**
 * `attribution.ts` says of its header allow-list: *"Adding a header here is a
 * decision, not a convenience. The test in `attribution.test.ts` pins the set
 * so that widening it is a visible diff."*
 *
 * This is that test. The allow-list guards what lands in a file with no TTL
 * that is never truncated, so the set has to fail closed: a header added to
 * `KEPT_HEADERS` must break this assertion and be argued for in review, not
 * arrive as a silent widening.
 */
import { describe, expect, test } from 'vitest'
import type { Context } from 'hono'
import { ATTRIBUTION_FIELDS, requestAttribution } from './attribution.js'

/** A `Context` that answers header lookups and nothing else. */
const contextWith = (headers: Record<string, string>): Context =>
  ({
    req: { header: (name: string) => headers[name.toLowerCase()] }
  }) as unknown as Context

describe('ATTRIBUTION_FIELDS', () => {
  test('is exactly the five fields the module argues for', () => {
    expect([...ATTRIBUTION_FIELDS]).toEqual([
      'userAgent',
      'forwardedFor',
      'forwardedHost',
      'forwardedProto',
      'referer'
    ])
  })
})

describe('requestAttribution', () => {
  test('keeps every allow-listed header, under its journal field name', () => {
    expect(
      requestAttribution(
        contextWith({
          'user-agent': 'ExampleWallet/1.2',
          'x-forwarded-for': '203.0.113.7',
          'x-forwarded-host': 'exchanges.example.org',
          'x-forwarded-proto': 'https',
          referer: 'https://wallet.example/present'
        })
      )
    ).toEqual({
      userAgent: 'ExampleWallet/1.2',
      forwardedFor: '203.0.113.7',
      forwardedHost: 'exchanges.example.org',
      forwardedProto: 'https',
      referer: 'https://wallet.example/present'
    })
  })

  test('keeps no header that is not allow-listed', () => {
    expect(
      requestAttribution(
        contextWith({
          authorization: 'Bearer sk-live-9f2c',
          cookie: 'session=abc',
          'user-agent': 'ExampleWallet/1.2'
        })
      )
    ).toEqual({ userAgent: 'ExampleWallet/1.2' })
  })

  test('omits an absent or empty header rather than writing it undefined', () => {
    // ⚠️ The convention the module states: a reader counting how many fetches
    // carried a `User-Agent` must be able to trust that the key's presence
    // means the header was there.
    const attribution = requestAttribution(
      contextWith({ 'user-agent': '', referer: 'https://wallet.example/present' })
    )
    expect(attribution).toEqual({ referer: 'https://wallet.example/present' })
    expect('userAgent' in attribution).toBe(false)
  })
})
