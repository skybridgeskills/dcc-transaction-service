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
 *   4. Merges per-OB results into `variables.results.default` via
 *      {@link mergeOpenBadgesResultsAt} and recomputes the exchange
 *      `state` from the merged `verified` flag.
 *   5. Commits via `saveExchangeWithCAS`. A stale worker whose attempt
 *      was superseded by a sweep loses CAS silently.
 *
 * The worker is dependency-injected for testing (no module mocks
 * required); production callers use {@link defaultProcessVerifyTaskDeps}.
 */
import type {
  CredentialVerificationResult,
  EntityIdentityRegistry,
  Verifier
} from '@digitalcredentials/verifier-core'
import { getConfig, mapRegistryNamesToRegistries } from '../../config.js'
import {
  getExchangeData,
  saveExchangeWithCAS as defaultSaveExchangeWithCAS
} from '../../transactionManager.js'
import { getVerifier } from '../verifier.js'
import { openbadgesSuitesFor as defaultOpenbadgesSuitesFor } from '../openbadges-suite-resolver.js'
import { markFailed, markRunning, markSucceeded } from './verify-task.js'

/** Dependencies for {@link processVerifyTask}. All are overridable for tests. */
export interface ProcessVerifyTaskDeps {
  /** Loads the verify exchange (or throws if not found / wrong workflow). */
  loadExchange: (exchangeId: string) => Promise<App.ExchangeDetailVerify>
  /** CAS-keyed write; returns `'committed' | 'stale' | 'not-found'`. */
  saveExchangeWithCAS: typeof defaultSaveExchangeWithCAS
  /** Just the per-credential verify call (the only verifier-core method we use). */
  verifyCredential: Verifier['verifyCredential']
  /** Resolves the registry list for this exchange (matches the sync pass). */
  resolveRegistries: (
    exchange: App.ExchangeDetailVerify
  ) => EntityIdentityRegistry[]
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

  let merged = baseResults
  let workerError: Error | undefined

  try {
    const registries = deps.resolveRegistries(exchange)
    for (const i of task.openBadgesCredentialIndices) {
      const cr = merged.credentialResults[i]
      if (!cr?.verifiableCredential) continue
      const obResult = await deps.verifyCredential({
        credential: cr.verifiableCredential,
        additionalSuites: deps.openbadgesSuitesFor(cr.verifiableCredential),
        registries
      })
      merged = mergeOpenBadgesResultsAt(merged, i, obResult)
    }
  } catch (e) {
    workerError = e instanceof Error ? e : new Error(String(e))
  }

  if (workerError) {
    return commitFailure(exchange, capturedAttemptId, deps, {
      message: workerError.message
    })
  }

  const finalState: App.ExchangeState = merged.verified ? 'complete' : 'invalid'
  const settled: App.ExchangeDetailVerify = {
    ...exchange,
    state: finalState,
    variables: {
      ...exchange.variables,
      results: { default: merged },
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
 * Replace `credentialResults[index]` in `merged` with a new entry that
 * unions the prior default-suite results with `obResult.results`,
 * recomputes the per-credential `verified` flag (logical AND), appends
 * the OB checks to `merged.allResults`, and recomputes the top-level
 * `verified` flag.
 *
 * Pure: returns a new {@link App.VerificationResult}; does not mutate
 * any input.
 *
 * `claimsValidation`, `issuerValidation`, and `matchedCredentials` are
 * untouched — the OB suites do not contribute claims-matching or
 * trusted-issuer signal, so the sync pass's findings remain correct.
 *
 * If `index` is out of range, `merged` is returned unchanged.
 */
export const mergeOpenBadgesResultsAt = (
  merged: App.VerificationResult,
  index: number,
  obResult: Pick<CredentialVerificationResult, 'verified' | 'results'>
): App.VerificationResult => {
  const prev = merged.credentialResults[index]
  if (!prev) return merged

  const updatedCr: App.CredentialVerificationResult = {
    ...prev,
    verified: prev.verified && obResult.verified,
    results: [...prev.results, ...obResult.results]
  }

  const credentialResults = merged.credentialResults.map((cr, i) =>
    i === index ? updatedCr : cr
  )

  return {
    ...merged,
    verified: merged.verified && obResult.verified,
    credentialResults,
    allResults: [...merged.allResults, ...obResult.results]
  }
}

/**
 * Default registry resolver — mirrors the sync pass's logic so the
 * async OB pass consults the same registries the wallet's POST hit.
 */
const defaultResolveRegistries = (
  exchange: App.ExchangeDetailVerify
): EntityIdentityRegistry[] => {
  const config = getConfig()
  const names =
    exchange.variables.trustedRegistries &&
    exchange.variables.trustedRegistries.length > 0
      ? exchange.variables.trustedRegistries
      : config.defaultTrustedRegistryNames
  return mapRegistryNamesToRegistries(names, config.knownRegistries)
}

/** Production wiring of {@link ProcessVerifyTaskDeps}. */
export const defaultProcessVerifyTaskDeps = (): ProcessVerifyTaskDeps => ({
  loadExchange: async (exchangeId) =>
    (await getExchangeData(exchangeId, 'verify')) as App.ExchangeDetailVerify,
  saveExchangeWithCAS: defaultSaveExchangeWithCAS,
  verifyCredential: (call) => getVerifier().verifyCredential(call),
  resolveRegistries: defaultResolveRegistries,
  openbadgesSuitesFor: defaultOpenbadgesSuitesFor
})
