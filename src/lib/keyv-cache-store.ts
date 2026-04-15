import type { CacheStore } from '@digitalcredentials/verifier-core'
import type Keyv from 'keyv'

/**
 * Adapts Keyv to verifier-core {@link CacheStore} (TTL in milliseconds).
 */
export function keyvCacheStore(keyv: Keyv): CacheStore {
  return {
    get: (key) => keyv.get(key),
    set: async (key, value, ttl) => {
      await keyv.set(key, value, ttl)
    }
  }
}
