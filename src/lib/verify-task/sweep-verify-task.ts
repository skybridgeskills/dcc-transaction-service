/**
 * GET-driven sweep policy for the asynchronous verify-task pass.
 *
 * Polling clients call this on every read of a verify exchange; it is
 * a pure read for healthy exchanges (no work, returns the same
 * reference) and only does CAS-protected work when:
 *
 *   - the exchange is `'active'` and has a `verifyTask`,
 *   - the task is in a sweepable status (`'queued'` or `'running'`),
 *   - and `verifyTask.deadlineAt` has lapsed (the worker either died
 *     or its attempt is taking too long).
 *
 * Decision then:
 *
 *   - If `attempt < maxAttempts`: bump the attempt (fresh `attemptId`,
 *     fresh `deadlineAt`), persist via CAS, and re-enqueue. The new
 *     `attemptId` invalidates any in-flight stale worker via CAS at
 *     commit, so we can safely re-enqueue without coordination.
 *   - Otherwise: mark `gave-up`, set state to `'invalid'`, and append
 *     a synthetic `pipeline.timeout` CheckResult to
 *     `variables.results.default.allResults` so the UI surfaces the
 *     failure with a structured reason.
 *
 * On CAS conflict we re-read the exchange and return the persisted
 * version (someone else's sweep won; their write is the truth).
 *
 * `failed` and terminal statuses (`succeeded`, `gave-up`) are
 * intentionally not swept here: a `failed` task means the worker
 * surfaced a hard error (network, malformed credential, etc.); the
 * v1 policy is "don't auto-retry" — that decision lives outside this
 * sweep. Phase 5/6 may revisit.
 */
import type { CheckResult as CoreCheckResult } from '@digitalcredentials/verifier-core'
import {
  getExchangeData,
  saveExchangeWithCAS as defaultSaveExchangeWithCAS
} from '../../transactionManager.js'
import { enqueueVerifyTask as defaultEnqueueVerifyTask } from './enqueue-verify-task.js'
import { bumpAttempt, markGaveUp } from './verify-task.js'
import { withVerifyTask } from './verify-task-worker.js'

/** Injected dependencies; overridable for tests. */
export interface SweepIfTimedOutDeps {
  /** Wall clock; defaults to `() => new Date()`. */
  now: () => Date
  /** Re-enqueue the bumped attempt onto the worker FIFO. */
  enqueueVerifyTask: (exchangeId: string) => void
  /** CAS-keyed write. */
  saveExchangeWithCAS: typeof defaultSaveExchangeWithCAS
  /** Re-read the exchange after a CAS conflict. */
  loadExchange: (exchangeId: string) => Promise<App.ExchangeDetailVerify>
}

/**
 * Inspect `exchange` and apply the sweep policy. Returns the
 * (possibly updated) exchange so callers can pass it directly to
 * their response. Non-verify exchanges are returned unchanged.
 */
export const sweepIfTimedOut = async (
  exchange: App.ExchangeDetailBase,
  config: App.Config,
  deps: Partial<SweepIfTimedOutDeps> = {}
): Promise<App.ExchangeDetailBase> => {
  if (exchange.workflowId !== 'verify') return exchange
  const verify = exchange as App.ExchangeDetailVerify
  if (verify.state !== 'active') return verify
  const task = verify.variables.verifyTask
  if (!task) return verify
  if (task.status !== 'queued' && task.status !== 'running') return verify

  const wired = wireDeps(deps)
  const nowMs = wired.now().getTime()
  if (Date.parse(task.deadlineAt) > nowMs) return verify

  if (task.attempt < task.maxAttempts) {
    return retryAttempt(verify, task, config, wired)
  }
  return giveUp(verify, task, wired)
}

// ----- internal flows -----------------------------------------------------

const retryAttempt = async (
  verify: App.ExchangeDetailVerify,
  task: App.VerifyTask,
  config: App.Config,
  deps: SweepIfTimedOutDeps
): Promise<App.ExchangeDetailVerify> => {
  const bumped = bumpAttempt(task, config.verifyTaskDeadlineMs)
  const next = withVerifyTask(verify, bumped)
  const result = await deps.saveExchangeWithCAS(
    verify.exchangeId,
    task.attemptId,
    () => next
  )
  if (result.status === 'committed') {
    deps.enqueueVerifyTask(verify.exchangeId)
    return next
  }
  return deps.loadExchange(verify.exchangeId)
}

const giveUp = async (
  verify: App.ExchangeDetailVerify,
  task: App.VerifyTask,
  deps: SweepIfTimedOutDeps
): Promise<App.ExchangeDetailVerify> => {
  const gaveUpTask = markGaveUp(task)
  const timeoutCheck = synthesizePipelineTimeoutCheckResult(task, deps.now())
  const next: App.ExchangeDetailVerify = {
    ...verify,
    state: 'invalid',
    variables: {
      ...verify.variables,
      verifyTask: gaveUpTask,
      results: appendAllResult(verify.variables.results, timeoutCheck)
    }
  }
  const result = await deps.saveExchangeWithCAS(
    verify.exchangeId,
    task.attemptId,
    () => next
  )
  if (result.status === 'committed') return next
  return deps.loadExchange(verify.exchangeId)
}

// ----- pure helpers -------------------------------------------------------

/**
 * Fill any unspecified {@link SweepIfTimedOutDeps} with their
 * production defaults (real clock, real Keyv-backed CAS save, real
 * `getExchangeData` reload, real in-process FIFO enqueue).
 *
 * Centralizing this here keeps the public `sweepIfTimedOut` signature
 * tight (callers in `hono.ts` / `exchanges.ts` / `interactions.ts`
 * pass nothing) while letting tests inject any subset of the deps
 * (commonly just `now` and `enqueueVerifyTask`).
 */
const wireDeps = (deps: Partial<SweepIfTimedOutDeps>): SweepIfTimedOutDeps => ({
  now: deps.now ?? (() => new Date()),
  enqueueVerifyTask: deps.enqueueVerifyTask ?? defaultEnqueueVerifyTask,
  saveExchangeWithCAS: deps.saveExchangeWithCAS ?? defaultSaveExchangeWithCAS,
  loadExchange:
    deps.loadExchange ??
    (async (id) =>
      (await getExchangeData(id, 'verify')) as App.ExchangeDetailVerify)
})

/**
 * Build a structured `pipeline.timeout` CheckResult that the verify
 * UI can render alongside verifier-core's own checks. Embeds the
 * task's last error message when present.
 */
export const synthesizePipelineTimeoutCheckResult = (
  task: App.VerifyTask,
  now: Date
): CoreCheckResult => {
  const detail = task.lastError
    ? `Open Badges verification did not finish within deadline after ${task.attempt} attempt(s). Last error: ${task.lastError.message}`
    : `Open Badges verification did not finish within deadline after ${task.attempt} attempt(s).`
  return {
    suite: 'verifier-pipeline',
    check: 'pipeline.timeout',
    outcome: {
      status: 'failure',
      problems: [
        {
          type: 'urn:dcc:verifier-pipeline:timeout',
          title: 'Verification timeout',
          detail
        }
      ]
    },
    timestamp: now.toISOString(),
    fatal: true
  }
}

/**
 * Append `check` to `results.default.allResults`, returning a fresh
 * results object. If `results` is `undefined`, fabricate a minimal
 * `default` shell containing only the timeout check — this matches
 * the shape the UI expects so a give-up exchange still renders.
 */
export const appendAllResult = (
  results: { default: App.VerificationResult } | undefined,
  check: App.CheckResult
): { default: App.VerificationResult } => {
  if (!results) {
    return {
      default: {
        verified: false,
        presentationResults: [],
        credentialResults: [],
        allResults: [check],
        matchedCredentials: []
      }
    }
  }
  return {
    default: {
      ...results.default,
      verified: false,
      allResults: [...results.default.allResults, check]
    }
  }
}
