import Keyv from 'keyv'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { CacheStore } from '@digitalcredentials/verifier-core'
import { DEFAULT_TTL_MS } from '@digitalcredentials/verifier-core'
import { cachedHttpGet } from './cached-http-get.js'
import { keyvCacheStore } from './keyv-cache-store.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('cachedHttpGet', () => {
  test('second call uses cache for OK JSON', async () => {
    const store = keyvCacheStore(new Keyv())
    const httpGet = cachedHttpGet(store)
    let fetches = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetches++
        return new Response(JSON.stringify({ x: 1 }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      })
    )

    const url = 'https://example.com/r'
    const a = await httpGet(url)
    const b = await httpGet(url)

    expect(fetches).toBe(1)
    expect(a.body).toEqual({ x: 1 })
    expect(b.body).toEqual({ x: 1 })
    expect(b.headers.get('cache-control')).toBeNull()
  })

  test('does not cache non-OK responses', async () => {
    const store = keyvCacheStore(new Keyv())
    const httpGet = cachedHttpGet(store)
    let fetches = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetches++
        return new Response('no', { status: 404 })
      })
    )

    const url = 'https://example.com/missing'
    await httpGet(url)
    await httpGet(url)
    expect(fetches).toBe(2)
  })

  test('uses Cache-Control max-age for TTL when recording to cache', async () => {
    const ttlMs: number[] = []
    const store: CacheStore = {
      get: async () => undefined,
      set: async (_k, _v, ttl) => {
        if (ttl !== undefined) ttlMs.push(ttl)
      }
    }
    const httpGet = cachedHttpGet(store)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({}), {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'cache-control': 'max-age=120'
          }
        })
      })
    )

    await httpGet('https://example.com/t')
    expect(ttlMs).toEqual([120_000])
  })

  test('uses default TTL when no Cache-Control', async () => {
    const ttlMs: number[] = []
    const store: CacheStore = {
      get: async () => undefined,
      set: async (_k, _v, ttl) => {
        if (ttl !== undefined) ttlMs.push(ttl)
      }
    }
    const httpGet = cachedHttpGet(store)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      })
    )

    await httpGet('https://example.com/u')
    expect(ttlMs).toEqual([DEFAULT_TTL_MS])
  })

  test('non-JSON responses return text body', async () => {
    const store = keyvCacheStore(new Keyv())
    const httpGet = cachedHttpGet(store)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('plain', {
          status: 200,
          headers: { 'content-type': 'text/plain' }
        })
      })
    )

    const r = await httpGet('https://example.com/text')
    expect(r.body).toBe('plain')
  })
})
