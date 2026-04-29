/**
 * Shared Keyv + {@link CachedHttpGetService} for verifier-core (`verifyPresentation` / registry).
 */
import type { CacheService } from '@digitalcredentials/verifier-core'
import type { HttpGetService } from '@digitalcredentials/verifier-core'
import Keyv from 'keyv'
import { createKeyvStore } from '../keyv-store.js'
import { CachedHttpGetService } from './cached-http-get-service.js'
import { KeyvCacheService } from './keyv-cache-service.js'

let verifierKeyv: Keyv | undefined
let memo: { httpGetService: HttpGetService; cacheService: CacheService } | undefined

export function getVerifierKeyv(): Keyv {
  if (!verifierKeyv) {
    verifierKeyv = createKeyvStore('verifier')
  }
  return verifierKeyv
}

/**
 * Singleton {@link HttpGetService} and domain {@link CacheService} backed by the verifier Keyv namespace.
 */
export function getVerifierVerificationFetchers(): {
  httpGetService: HttpGetService
  cacheService: CacheService
} {
  if (!memo) {
    const keyv = getVerifierKeyv()
    const cacheService = KeyvCacheService(keyv)
    memo = { httpGetService: CachedHttpGetService(cacheService), cacheService }
  }
  return memo
}

/** @internal Resets singletons (e.g. tests). */
export function resetVerifierKeyvForTests(): void {
  verifierKeyv = undefined
  memo = undefined
}

getVerifierKeyv()
