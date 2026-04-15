import {
  parseCacheControlMaxAge,
  resolveTtl,
  type CacheStore,
  type HttpGet,
  type HttpGetResult
} from '@digitalcredentials/verifier-core'

type CachedHttpEntry = Pick<HttpGetResult, 'body' | 'status'>

function cacheKeyForUrl(url: string): string {
  return `http:${url}`
}

/**
 * HTTP GET with response body caching in a {@link CacheStore}.
 * Successful responses are cached with TTL from `Cache-Control: max-age` when present.
 * Response headers are not stored; cache hits use empty {@link Headers}.
 */
export function cachedHttpGet(cache: CacheStore): HttpGet {
  return async (url: string): Promise<HttpGetResult> => {
    const cached = (await cache.get(
      cacheKeyForUrl(url)
    )) as CachedHttpEntry | undefined
    if (cached) {
      return {
        body: cached.body,
        status: cached.status,
        headers: new Headers()
      }
    }

    const response = await fetch(url)
    const contentType = response.headers.get('content-type') ?? ''
    let body: unknown
    try {
      body = contentType.includes('json')
        ? await response.json()
        : await response.text()
    } catch {
      body = null
    }

    const result: HttpGetResult = {
      body,
      headers: response.headers,
      status: response.status
    }

    if (response.ok) {
      const ttl = resolveTtl(parseCacheControlMaxAge(response.headers))
      await cache.set(
        cacheKeyForUrl(url),
        { body, status: response.status } satisfies CachedHttpEntry,
        ttl
      )
    }

    return result
  }
}
