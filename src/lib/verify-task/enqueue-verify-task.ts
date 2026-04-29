/**
 * In-process FIFO queue for asynchronous {@link processVerifyTask} runs.
 *
 * The verify workflow's POST handler returns a 200 to the wallet as
 * soon as the synchronous default-suites pass commits, then calls
 * {@link enqueueVerifyTask} to schedule the Open Badges pass on the
 * Node event loop. The queue is intentionally lightweight:
 *
 *   - One module-scope FIFO array of `exchangeId` strings.
 *   - One `running` flag guards a single drainer loop, so multiple
 *     `enqueueVerifyTask` calls coalesce into one serial worker.
 *   - The drainer is scheduled via `setImmediate` so the calling
 *     request handler always returns first (no synchronous reentry).
 *
 * Cross-process coordination is out of scope: this service runs as a
 * single replica per the design doc. CAS in {@link saveExchangeWithCAS}
 * still protects against the *one* race that does exist within a
 * process — a stale worker losing to a sweep-bumped attempt.
 *
 * TODO: Evaluate for approach that enables load balanced instances. If
 * we ignore exchanges that have a task in progress that hasn't timed
 * out, even dropping the exchangeId from a local thread's queue,
 * we could run multiple instances of this service in parallel and
 * balance the load, depending on the fact that the caller will be GET
 * polling the exchange as long as they do continue to care about it.
 * Whatever instance picks up that request can start processing it then
 * if there is a expired task.
 *
 * The processor (default {@link processVerifyTask}) is dependency-
 * injected so tests can drive deterministic outcomes without spinning
 * up the full verifier.
 */
import { processVerifyTask } from './verify-task-worker.js'

const queue: string[] = []
let running = false
/**
 * Generation token bumped by {@link resetVerifyTaskQueueForTests}. A
 * drainer callback that was scheduled before a reset checks its captured
 * token against the current generation and bails immediately if they
 * differ — preventing a stale `setImmediate(drain)` from running
 * concurrently with a freshly-armed drainer in the next test.
 *
 * Plays no role in production; tests are the only thing that resets.
 */
let generation = 0
let activeProcessor: (exchangeId: string) => Promise<unknown> =
  processVerifyTask

/**
 * Append `exchangeId` to the FIFO and ensure the drainer loop runs.
 * Returns immediately. Safe (and expected) to call multiple times for
 * the same id; the worker dedupes via `attemptId` at commit time
 * through CAS.
 */
export const enqueueVerifyTask = (exchangeId: string): void => {
  queue.push(exchangeId)
  if (!running) {
    running = true
    const myGeneration = generation
    setImmediate(() => drain(myGeneration))
  }
}

const drain = async (myGeneration: number): Promise<void> => {
  if (myGeneration !== generation) return // stale: a test reset re-armed
  try {
    while (queue.length > 0 && myGeneration === generation) {
      const next = queue.shift()!
      try {
        await activeProcessor(next)
      } catch {
        // Worker swallows its own errors via saveExchangeWithCAS;
        // anything thrown here is a defensive bug. Don't let one bad
        // task wedge the queue.
      }
    }
  } finally {
    if (myGeneration === generation) running = false
  }
}

/**
 * @internal Test seam: replace the processor invoked by the drainer.
 * Use {@link resetVerifyTaskQueueForTests} between tests to restore
 * defaults and clear any leftover queue state.
 */
export const setVerifyTaskProcessorForTests = (
  processor: (exchangeId: string) => Promise<unknown>
): void => {
  activeProcessor = processor
}

/**
 * @internal Test isolation: drop any pending ids and restore the
 * default processor. Does *not* await an in-flight drain; tests that
 * need to observe completion should use the `processor` callback
 * itself to signal.
 */
export const resetVerifyTaskQueueForTests = (): void => {
  queue.length = 0
  running = false
  generation++
  activeProcessor = processVerifyTask
}

/** @internal Test introspection: snapshot of pending ids in FIFO order. */
export const peekVerifyTaskQueueForTests = (): readonly string[] => [...queue]
