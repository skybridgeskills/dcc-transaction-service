/**
 * Asynchronous Open Badges verification worker.
 *
 * `processVerifyTask(exchangeId)` is invoked by the FIFO queue
 * ({@link ../enqueue-verify-task.ts}) for one verify exchange. It:
 *
 *   1. Loads the exchange and captures `verifyTask.attemptId` for CAS.
 *   2. Marks the task `running` (best-effort; CAS at commit is the
 *      authoritative gate).
 *   3. Runs `verifier.verifyCredential` for each OB credential index in
 *      `task.openBadgesCredentialIndices`, applying the OB suites
 *      returned by {@link openbadgesSuitesFor}.
 *   4. Replaces each OB credential's entry in `variables.results.default`
 *      with the OB pass's own result via {@link replaceCredentialResultAt},
 *      and decides the exchange `state` with `decideExchangeState` — the
 *      same function the sync pass uses.
 *   5. Commits via `saveExchangeWithCAS`. A stale worker whose attempt
 *      was superseded by a sweep loses CAS silently.
 *
 * The worker is dependency-injected for testing (no module mocks
 * required); production callers use {@link defaultProcessVerifyTaskDeps}.
 */
import type {
  EntityIdentityRegistry,
  Verifier
} from '@digitalcredentials/verifier-core'
import { getConfig, resolveTrustedRegistries } from '../../config.js'
import {
  getExchangeData,
  saveExchangeWithCAS as defaultSaveExchangeWithCAS
} from '../../transactionManager.js'
import { getVerifier } from '../verifier.js'
import { openbadgesSuitesFor as defaultOpenbadgesSuitesFor } from '../openbadges-suite-resolver.js'
import { markFailed, markRunning, markSucceeded } from './verify-task.js'
import { decideExchangeState, recomputeVerified } from '../verify-outcome.js'

/** Dependencies for {@link processVerifyTask}. All are overridable for tests. */
export interface ProcessVerifyTaskDeps {
  /** Loads the verify exchange (or throws if not found / wrong workflow). */
  loadExchange: (exchangeId: string) => Promise<App.ExchangeDetailVerify>
  /** CAS-keyed write; returns `'committed' | 'stale' | 'not-found'`. */
  saveExchangeWithCAS: typeof defaultSaveExchangeWithCAS
  /** Just the per-credential verify call (the only verifier-core method we use). */
  verifyCredential: Verifier['verifyCredential']
  /**
   * Resolves the registry list for this exchange (matches the sync pass).
   * `undefined` skips the issuer-registry suite; `[]` would not.
   */
  resolveRegistries: (
    exchange: App.ExchangeDetailVerify
  ) => EntityIdentityRegistry[] | undefined
  /** Resolves the OB suites to apply for one credential. */
  openbadgesSuitesFor: typeof defaultOpenbadgesSuitesFor
}

/**
 * Process the asynchronous OB pass for `exchangeId`. Returns a
 * status describing what the worker observed; callers (the queue) can
 * use it for logging but the persisted state is authoritative.
 */
export type ProcessVerifyTaskOutcome =
  | 'no-task'
  | 'already-terminal'
  | 'not-found'
  | 'stale'
  | 'succeeded'
  | 'failed'

export const processVerifyTask = async (
  exchangeId: string,
  deps: ProcessVerifyTaskDeps = defaultProcessVerifyTaskDeps()
): Promise<ProcessVerifyTaskOutcome> => {
  let exchange: App.ExchangeDetailVerify
  try {
    exchange = await deps.loadExchange(exchangeId)
  } catch {
    return 'not-found'
  }

  const task = exchange.variables.verifyTask
  if (!task) return 'no-task'
  if (task.status === 'succeeded' || task.status === 'gave-up') {
    return 'already-terminal'
  }

  const capturedAttemptId = task.attemptId

  // Best-effort mark as running. If CAS fails here we don't bail —
  // the authoritative gate is the final commit; a stale 'running'
  // mark is harmless.
  await deps.saveExchangeWithCAS(exchangeId, capturedAttemptId, (current) =>
    withVerifyTask(current as App.ExchangeDetailVerify, markRunning(task))
  )

  const baseResults = exchange.variables.results?.default
  if (!baseResults) {
    // Defensive: a task implies the sync pass already populated results.
    // If not, treat as a worker error so a sweep can decide.
    return commitFailure(exchange, capturedAttemptId, deps, {
      message: 'verifyTask present but variables.results.default is missing'
    })
  }

  let next = baseResults
  let workerError: Error | undefined

  try {
    const registries = deps.resolveRegistries(exchange)
    const verifierOptions = exchange.variables.options ?? {}
    for (const i of task.openBadgesCredentialIndices) {
      const cr = next.credentialResults[i]
      if (!cr?.verifiableCredential) continue
      const obResult = await deps.verifyCredential({
        credential: cr.verifiableCredential,
        additionalSuites: deps.openbadgesSuitesFor(cr.verifiableCredential),
        registries,
        ...(verifierOptions.timing !== undefined && {
          timing: verifierOptions.timing
        })
      })
      next = replaceCredentialResultAt(next, i, obResult)
    }
  } catch (e) {
    workerError = e instanceof Error ? e : new Error(String(e))
  }

  if (workerError) {
    return commitFailure(exchange, capturedAttemptId, deps, {
      message: workerError.message
    })
  }

  const settled: App.ExchangeDetailVerify = {
    ...exchange,
    state: decideExchangeState(next, exchange),
    variables: {
      ...exchange.variables,
      results: { default: next },
      verifyTask: markSucceeded(task)
    }
  }
  const result = await deps.saveExchangeWithCAS(
    exchangeId,
    capturedAttemptId,
    () => settled
  )
  return result.status === 'committed' ? 'succeeded' : result.status
}

// ----- helpers (pure unless noted) ----------------------------------------

const commitFailure = async (
  exchange: App.ExchangeDetailVerify,
  capturedAttemptId: string,
  deps: ProcessVerifyTaskDeps,
  error: { message: string }
): Promise<ProcessVerifyTaskOutcome> => {
  const task = exchange.variables.verifyTask!
  const result = await deps.saveExchangeWithCAS(
    exchange.exchangeId,
    capturedAttemptId,
    (current) =>
      withVerifyTask(
        current as App.ExchangeDetailVerify,
        markFailed(task, error)
      )
  )
  if (result.status === 'committed') return 'failed'
  return result.status
}

/**
 * Return a new exchange with `task` swapped into
 * `variables.verifyTask`. Pure; preserves all other variables and
 * top-level fields (state, expires, etc).
 */
export const withVerifyTask = (
  exchange: App.ExchangeDetailVerify,
  task: App.VerifyTask
): App.ExchangeDetailVerify => ({
  ...exchange,
  variables: { ...exchange.variables, verifyTask: task }
})

/**
 * Replace `credentialResults[index]` in `current` with `obResult`, the Open
 * Badges pass's own result for that credential, and recompute the
 * top-level `verified` from its parts.
 *
 * ⚠️ Replace, don't merge. The OB pass calls `verifyCredential` with the
 * default suites plus the OB suites, and verifier-core returns every check
 * that ran, so `obResult` is a complete single-run verdict for that
 * credential — a superset of what the sync pass recorded for it. Merging
 * rows from two runs is how the old merge came to need its own dedupe rules.
 *
 * Pure: returns a new {@link App.VerificationResult}; does not mutate
 * any input.
 *
 * `claimsValidation`, `issuerValidation`, `matchedCredentials` and every
 * other field are carried over untouched.
 *
 * If `index` is out of range, `current` is returned unchanged.
 */
export const replaceCredentialResultAt = (
  current: App.VerificationResult,
  index: number,
  obResult: App.CredentialVerificationResult
): App.VerificationResult => {
  if (!current.credentialResults[index]) return current

  const next: App.VerificationResult = {
    ...current,
    credentialResults: current.credentialResults.map((cr, i) =>
      i === index ? obResult : cr
    )
  }
  return { ...next, verified: recomputeVerified(next) }
}

/**
 * Default registry resolver — mirrors the sync pass's logic so the
 * async OB pass consults the same registries the wallet's POST hit.
 */
const defaultResolveRegistries = (
  exchange: App.ExchangeDetailVerify
): EntityIdentityRegistry[] | undefined =>
  resolveTrustedRegistries(exchange.variables.trustedRegistries, getConfig())

/** Production wiring of {@link ProcessVerifyTaskDeps}. */
export const defaultProcessVerifyTaskDeps = (): ProcessVerifyTaskDeps => ({
  loadExchange: async (exchangeId) =>
    (await getExchangeData(exchangeId, 'verify')) as App.ExchangeDetailVerify,
  saveExchangeWithCAS: defaultSaveExchangeWithCAS,
  verifyCredential: (call) => getVerifier().verifyCredential(call),
  resolveRegistries: defaultResolveRegistries,
  openbadgesSuitesFor: defaultOpenbadgesSuitesFor
})
