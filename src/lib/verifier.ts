/**
 * Process-wide {@link Verifier} singleton built via verifier-core's
 * {@link createVerifier} factory.
 *
 * All call sites in this service that perform credential or presentation
 * verification go through `getVerifier()` so the verifier-core caches
 * (issuer DID documents, status list credentials, JSON-LD contexts) are
 * shared across calls — both the synchronous "default suites" pass on
 * incoming presentations and the asynchronous Open Badges pass that
 * runs in the background.
 *
 * Per-call options (notably `registries`, `additionalSuites`, and
 * `challenge`) are still passed at the call site; the singleton owns
 * only the long-lived dependencies. This keeps per-exchange registry
 * overrides working without rebuilding the verifier.
 */
import { createVerifier, type Verifier } from '@digitalcredentials/verifier-core'
import { getVerifierVerificationFetchers } from './verifier-keyv-store.js'

let verifier: Verifier | undefined

/**
 * Returns the shared {@link Verifier}. First call builds it using the
 * shared {@link getVerifierVerificationFetchers} services so the
 * verifier-core HTTP cache is the same Keyv-backed store the rest of
 * the service uses.
 */
export const getVerifier = (): Verifier => {
  if (!verifier) {
    const { httpGetService, cacheService } = getVerifierVerificationFetchers()
    verifier = createVerifier({ httpGetService, cacheService })
  }
  return verifier
}

/** @internal Resets the singleton (e.g. for test isolation). */
export const resetVerifierForTests = (): void => {
  verifier = undefined
}
