import type { CacheService } from '@digitalcredentials/verifier-core'
import type Keyv from 'keyv'

/**
 * Adapts Keyv to verifier-core {@link CacheService} (TTL in milliseconds).
 */
export function KeyvCacheService(keyv: Keyv): CacheService {
  return {
    get: (key) => keyv.get(key),
    set: async (key, value, ttl) => {
      await keyv.set(key, value, ttl)
    }
  }
}
