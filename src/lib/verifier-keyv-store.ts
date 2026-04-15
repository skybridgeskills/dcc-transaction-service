/**
 * Shared Keyv + {@link cachedHttpGet} for verifier-core (`verifyPresentation` / registry).
 */
import type { CacheStore } from '@digitalcredentials/verifier-core'
import type { HttpGet } from '@digitalcredentials/verifier-core'
import Keyv from 'keyv'
import { createKeyvStore } from '../keyv-store.js'
import { cachedHttpGet } from './cached-http-get.js'
import { keyvCacheStore } from './keyv-cache-store.js'

let verifierKeyv: Keyv | undefined
let memo: { httpGet: HttpGet; cache: CacheStore } | undefined

export function getVerifierKeyv(): Keyv {
  if (!verifierKeyv) {
    verifierKeyv = createKeyvStore('verifier')
  }
  return verifierKeyv
}

/**
 * Singleton {@link HttpGet} and domain {@link CacheStore} backed by the verifier Keyv namespace.
 */
export function getVerifierVerificationFetchers(): {
  httpGet: HttpGet
  cache: CacheStore
} {
  if (!memo) {
    const keyv = getVerifierKeyv()
    const cache = keyvCacheStore(keyv)
    memo = { httpGet: cachedHttpGet(cache), cache }
  }
  return memo
}

/** @internal Resets singletons (e.g. tests). */
export function resetVerifierKeyvForTests(): void {
  verifierKeyv = undefined
  memo = undefined
}

getVerifierKeyv()
