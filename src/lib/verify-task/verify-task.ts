/**
 * Pure factory and transition helpers for {@link App.VerifyTask}.
 *
 * A `VerifyTask` lives on `ExchangeDetailVerify['variables'].verifyTask`
 * and tracks the asynchronous Open Badges verification pass for a
 * verify exchange. These helpers never mutate; each returns a new
 * task object so callers can compose with the rest of an immutable
 * exchange update.
 *
 * The lifecycle is:
 *
 *   newVerifyTask  →  queued
 *   markRunning    →  running
 *   markSucceeded  →  succeeded     (terminal)
 *   markFailed     →  failed        (a sweep may bumpAttempt back to queued)
 *   bumpAttempt    →  queued        (clears startedAt + lastError, fresh attemptId + deadline)
 *   markGaveUp     →  gave-up       (terminal; sweep finalizes the exchange)
 */

/** Inputs required to start a new verify task on its first attempt. */
export interface NewVerifyTaskInput {
  /** Indices into `variables.results.default.credentialResults` needing OB verification. */
  openBadgesCredentialIndices: number[]
  /** Per-attempt deadline window in ms (typically `config.verifyTaskDeadlineMs`). */
  deadlineMs: number
  /** Cap on attempts (initial + retries; typically `config.verifyTaskMaxAttempts`). */
  maxAttempts: number
}

/**
 * Build a fresh `VerifyTask` in the `queued` state with `attempt: 1`.
 * The first `attemptId` is a fresh UUID so a worker can later prove it
 * is still the rightful owner via CAS at commit time.
 */
export const newVerifyTask = (input: NewVerifyTaskInput): App.VerifyTask => {
  const now = new Date()
  return {
    attemptId: crypto.randomUUID(),
    queuedAt: now.toISOString(),
    deadlineAt: new Date(now.getTime() + input.deadlineMs).toISOString(),
    attempt: 1,
    maxAttempts: input.maxAttempts,
    openBadgesCredentialIndices: [...input.openBadgesCredentialIndices],
    status: 'queued'
  }
}

/**
 * Bump a task to its next attempt: increment `attempt`, mint a new
 * `attemptId` (so any in-flight stale worker fails CAS), refresh
 * `deadlineAt`, drop `startedAt` and `lastError`, and reset status to
 * `queued` so a worker will pick it up.
 *
 * Callers should check `attempt < maxAttempts` themselves and use
 * {@link markGaveUp} when no attempts remain.
 */
export const bumpAttempt = (
  task: App.VerifyTask,
  deadlineMs: number
): App.VerifyTask => {
  const now = new Date()
  return {
    ...task,
    attemptId: crypto.randomUUID(),
    queuedAt: now.toISOString(),
    deadlineAt: new Date(now.getTime() + deadlineMs).toISOString(),
    attempt: task.attempt + 1,
    status: 'queued',
    startedAt: undefined,
    lastError: undefined
  }
}

/** Worker pickup: stamp `startedAt` and move to `running`. */
export const markRunning = (task: App.VerifyTask): App.VerifyTask => ({
  ...task,
  startedAt: new Date().toISOString(),
  status: 'running'
})

/** Worker finished all OB credentials cleanly. */
export const markSucceeded = (task: App.VerifyTask): App.VerifyTask => ({
  ...task,
  status: 'succeeded'
})

/**
 * Worker errored mid-attempt. Status moves to `failed`; the sweep on
 * the next GET decides whether to {@link bumpAttempt} or {@link markGaveUp}.
 */
export const markFailed = (
  task: App.VerifyTask,
  error: { message: string }
): App.VerifyTask => ({
  ...task,
  status: 'failed',
  lastError: { message: error.message, at: new Date().toISOString() }
})

/** Terminal: no attempts remain. The sweep finalizes the exchange. */
export const markGaveUp = (task: App.VerifyTask): App.VerifyTask => ({
  ...task,
  status: 'gave-up'
})
