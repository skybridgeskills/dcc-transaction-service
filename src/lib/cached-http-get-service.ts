import {
  type CacheService,
  type HttpGetResult,
  type HttpGetService
} from '@digitalcredentials/verifier-core'

/** Default cache TTL for HTTP GET responses without `Cache-Control: max-age`. */
export const DEFAULT_TTL_MS = 5 * 60 * 1000

type CachedHttpEntry = Pick<HttpGetResult, 'body' | 'status'>

function cacheKeyForUrl(url: string): string {
  return `http:${url}`
}

/**
 * HTTP GET service with response body caching in a {@link CacheService}.
 * Successful responses are cached with TTL from `Cache-Control: max-age` when present.
 * Response headers are not stored; cache hits use empty {@link Headers}.
 */
export function CachedHttpGetService(cacheService: CacheService): HttpGetService {
  return {
    async get(url: string): Promise<HttpGetResult> {
      const cached = (await cacheService.get(
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
        const ttl = parseCacheControlMaxAge(response.headers) ?? DEFAULT_TTL_MS
        await cacheService.set(
          cacheKeyForUrl(url),
          { body, status: response.status } satisfies CachedHttpEntry,
          ttl
        )
      }

      return result
    }
  }
}

/**
 * Parse the `max-age` directive from a `Cache-Control` header into ms.
 * Returns `undefined` when the header is missing, malformed, or the
 * value is non-positive.
 *
 * Inlined here after `parseCacheControlMaxAge`/`resolveTtl` were demoted
 * from verifier-core's public surface in 1.0.
 */
function parseCacheControlMaxAge(headers: Headers): number | undefined {
  const value = headers.get('cache-control')
  if (!value) return undefined
  const match = /(?:^|[,\s])max-age\s*=\s*(\d+)/i.exec(value)
  if (!match) return undefined
  const seconds = Number.parseInt(match[1], 10)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return seconds * 1000
}
