import Keyv from 'keyv'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { CacheService } from '@digitalcredentials/verifier-core'
import { CachedHttpGetService, DEFAULT_TTL_MS } from './cached-http-get-service.js'
import { KeyvCacheService } from './keyv-cache-service.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CachedHttpGetService', () => {
  test('second call uses cache for OK JSON', async () => {
    const cacheService = KeyvCacheService(new Keyv())
    const httpGetService = CachedHttpGetService(cacheService)
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
    const a = await httpGetService.get(url)
    const b = await httpGetService.get(url)

    expect(fetches).toBe(1)
    expect(a.body).toEqual({ x: 1 })
    expect(b.body).toEqual({ x: 1 })
    expect(b.headers.get('cache-control')).toBeNull()
  })

  test('does not cache non-OK responses', async () => {
    const cacheService = KeyvCacheService(new Keyv())
    const httpGetService = CachedHttpGetService(cacheService)
    let fetches = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetches++
        return new Response('no', { status: 404 })
      })
    )

    const url = 'https://example.com/missing'
    await httpGetService.get(url)
    await httpGetService.get(url)
    expect(fetches).toBe(2)
  })

  test('uses Cache-Control max-age for TTL when recording to cache', async () => {
    const ttlMs: number[] = []
    const cacheService: CacheService = {
      get: async () => undefined,
      set: async (_k, _v, ttl) => {
        if (ttl !== undefined) ttlMs.push(ttl)
      }
    }
    const httpGetService = CachedHttpGetService(cacheService)
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

    await httpGetService.get('https://example.com/t')
    expect(ttlMs).toEqual([120_000])
  })

  test('uses default TTL when no Cache-Control', async () => {
    const ttlMs: number[] = []
    const cacheService: CacheService = {
      get: async () => undefined,
      set: async (_k, _v, ttl) => {
        if (ttl !== undefined) ttlMs.push(ttl)
      }
    }
    const httpGetService = CachedHttpGetService(cacheService)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('{}', {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      })
    )

    await httpGetService.get('https://example.com/u')
    expect(ttlMs).toEqual([DEFAULT_TTL_MS])
  })

  test('non-JSON responses return text body', async () => {
    const cacheService = KeyvCacheService(new Keyv())
    const httpGetService = CachedHttpGetService(cacheService)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response('plain', {
          status: 200,
          headers: { 'content-type': 'text/plain' }
        })
      })
    )

    const r = await httpGetService.get('https://example.com/text')
    expect(r.body).toBe('plain')
  })
})
