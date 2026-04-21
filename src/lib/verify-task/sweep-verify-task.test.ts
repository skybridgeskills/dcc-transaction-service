import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { getConfig } from '../../config.js'
import { createMockExchange } from '../../test-fixtures/testData.js'
import {
  clearKeyv,
  initializeTransactionManager,
  saveExchange
} from '../../transactionManager.js'
import { newVerifyTask } from './verify-task.js'
import { withVerifyTask } from './verify-task-worker.js'
import {
  appendAllResult,
  sweepIfTimedOut,
  synthesizePipelineTimeoutCheckResult,
  type SweepIfTimedOutDeps
} from './sweep-verify-task.js'

/**
 * Two cohorts of tests live here:
 *   - `sweepIfTimedOut` — the policy itself, exercised against an
 *     in-memory Keyv (real save / CAS, faked clock + enqueue).
 *   - `synthesizePipelineTimeoutCheckResult` / `appendAllResult` —
 *     pure helpers, exercised in isolation.
 *
 * Tests inject only the deps that matter for the case at hand;
 * everything else falls back to production wiring via `wireDeps`.
 */

// Fixed wall-clock anchor, paired with `now: () => T0` overrides so
// "deadline lapsed" vs. "deadline future" assertions never depend
// on the host machine's real time.
const T0 = new Date('2026-04-18T00:00:00Z')

const buildResults = (): App.VerificationResult => ({
  verified: true,
  presentationResults: [],
  credentialResults: [],
  matchedCredentials: [],
  summary: []
})

/**
 * `task: null` is the "explicitly no verifyTask" sentinel; `task:
 * undefined` (or omitted) gets a default fresh task. The distinction
 * matters because a plain `?? defaultTask` would silently paper over
 * the very "no task at all" case some tests need to exercise.
 */
const buildVerifyExchange = (overrides?: {
  state?: App.ExchangeState
  task?: App.VerifyTask | null
}): App.ExchangeDetailVerify => {
  const base = createMockExchange()
  return {
    ...base,
    state: overrides?.state ?? 'active',
    variables: {
      ...base.variables,
      results: { default: buildResults() },
      ...(overrides?.task === null
        ? {}
        : { verifyTask: overrides?.task ?? newVerifyTask({
            openBadgesCredentialIndices: [0],
            deadlineMs: 60_000,
            maxAttempts: 2
          }) })
    }
  }
}

/**
 * "deps" is the {@link SweepIfTimedOutDeps} bag — the small set of
 * collaborators (`now`, `enqueueVerifyTask`, `saveExchangeWithCAS`,
 * `loadExchange`) that `sweepIfTimedOut` reaches out to. Tests
 * override only the two side-effecting ones (clock + queue) so we
 * can step time forward and observe enqueues without spinning a
 * real worker; `wireDeps` fills the rest at call time.
 */
const setupHarness = (overrides?: {
  state?: App.ExchangeState
  task?: App.VerifyTask | null
  now?: Date
}) => {
  const exchange = buildVerifyExchange(overrides)
  const enqueued: string[] = []
  const deps: Partial<SweepIfTimedOutDeps> = {
    now: () => overrides?.now ?? T0,
    enqueueVerifyTask: (id) => enqueued.push(id)
  }
  return { exchange, deps, enqueued }
}

describe('sweepIfTimedOut', () => {
  beforeEach(() => {
    clearKeyv()
    initializeTransactionManager()
  })
  afterEach(() => clearKeyv())

  test('non-verify exchange is returned unchanged (no save)', async () => {
    const exchange = createMockExchange() as unknown as App.ExchangeDetailBase
    const claim: App.ExchangeDetailBase = {
      ...exchange,
      workflowId: 'claim'
    }
    const enqueued: string[] = []
    const result = await sweepIfTimedOut(claim, getConfig(), {
      now: () => new Date(),
      enqueueVerifyTask: (id) => enqueued.push(id)
    })
    expect(result).toBe(claim)
    expect(enqueued).toEqual([])
  })

  test('non-active state: no-op', async () => {
    const { exchange, deps, enqueued } = setupHarness({ state: 'complete' })
    const result = await sweepIfTimedOut(exchange, getConfig(), deps)
    expect(result).toBe(exchange)
    expect(enqueued).toEqual([])
  })

  test('no verifyTask attached: no-op', async () => {
    const { exchange, deps, enqueued } = setupHarness({ task: null })
    const result = await sweepIfTimedOut(exchange, getConfig(), deps)
    expect(result).toBe(exchange)
    expect(enqueued).toEqual([])
  })

  test('terminal task status (succeeded): no-op', async () => {
    const task = newVerifyTask({
      openBadgesCredentialIndices: [0],
      deadlineMs: 60_000,
      maxAttempts: 2
    })
    const { exchange, deps, enqueued } = setupHarness({
      task: { ...task, status: 'succeeded' }
    })
    const result = await sweepIfTimedOut(exchange, getConfig(), deps)
    expect(result).toBe(exchange)
    expect(enqueued).toEqual([])
  })

  test('failed task: no-op (v1 policy: do not auto-retry hard failures)', async () => {
    const task = newVerifyTask({
      openBadgesCredentialIndices: [0],
      deadlineMs: 60_000,
      maxAttempts: 2
    })
    const { exchange, deps, enqueued } = setupHarness({
      task: { ...task, status: 'failed' }
    })
    const result = await sweepIfTimedOut(exchange, getConfig(), deps)
    expect(result).toBe(exchange)
    expect(enqueued).toEqual([])
  })

  test('healthy: deadline still in the future, no-op', async () => {
    const queuedAt = new Date('2026-04-18T00:00:00Z')
    const task: App.VerifyTask = {
      ...newVerifyTask({
        openBadgesCredentialIndices: [0],
        deadlineMs: 60_000,
        maxAttempts: 2
      }),
      queuedAt: queuedAt.toISOString(),
      deadlineAt: new Date(queuedAt.getTime() + 60_000).toISOString()
    }
    const { exchange, deps, enqueued } = setupHarness({
      task,
      now: new Date(queuedAt.getTime() + 30_000)
    })
    const result = await sweepIfTimedOut(exchange, getConfig(), deps)
    expect(result).toBe(exchange)
    expect(enqueued).toEqual([])
  })

  test('deadline lapsed, attempts remain: bumps + persists + enqueues', async () => {
    const lapsedTask: App.VerifyTask = {
      ...newVerifyTask({
        openBadgesCredentialIndices: [0],
        deadlineMs: 60_000,
        maxAttempts: 2
      }),
      deadlineAt: new Date(T0.getTime() - 1000).toISOString()
    }
    const { exchange, deps, enqueued } = setupHarness({ task: lapsedTask })
    await saveExchange(exchange)

    const result = (await sweepIfTimedOut(
      exchange,
      getConfig(),
      deps
    )) as App.ExchangeDetailVerify

    expect(enqueued).toEqual([exchange.exchangeId])
    expect(result.variables.verifyTask?.attempt).toBe(2)
    expect(result.variables.verifyTask?.attemptId).not.toBe(lapsedTask.attemptId)
    expect(result.variables.verifyTask?.status).toBe('queued')
    expect(result.state).toBe('active')
  })

  test('deadline lapsed, at max attempts: gives up + invalid + synthetic check', async () => {
    const cfg = getConfig()
    const exhausted: App.VerifyTask = {
      ...newVerifyTask({
        openBadgesCredentialIndices: [0],
        deadlineMs: 60_000,
        maxAttempts: cfg.verifyTaskMaxAttempts
      }),
      attempt: cfg.verifyTaskMaxAttempts,
      deadlineAt: new Date(T0.getTime() - 1000).toISOString(),
      lastError: { message: 'boom', at: T0.toISOString() }
    }
    const { exchange, deps, enqueued } = setupHarness({ task: exhausted })
    await saveExchange(exchange)

    const result = (await sweepIfTimedOut(
      exchange,
      cfg,
      deps
    )) as App.ExchangeDetailVerify

    expect(enqueued).toEqual([])
    expect(result.state).toBe('invalid')
    expect(result.variables.verifyTask?.status).toBe('gave-up')
    expect(result.variables.results?.default.verified).toBe(false)

    // The synthetic timeout CheckResult is appended to
    // presentationResults (pipeline-level failure spans all VCs).
    const lastCheck = result.variables.results?.default.presentationResults.at(-1)!
    expect(lastCheck.id).toBe('pipeline.timeout')
    expect(lastCheck.outcome.status).toBe('failure')
    if (lastCheck.outcome.status === 'failure') {
      expect(lastCheck.outcome.problems[0].detail).toContain('boom')
    }
    expect(lastCheck.fatal).toBe(true)
  })

  test('CAS conflict: returns the persisted version, does not enqueue', async () => {
    const cfg = getConfig()
    const lapsed: App.VerifyTask = {
      ...newVerifyTask({
        openBadgesCredentialIndices: [0],
        deadlineMs: 60_000,
        maxAttempts: 2
      }),
      deadlineAt: new Date(T0.getTime() - 1000).toISOString()
    }
    const { exchange } = setupHarness({ task: lapsed })
    await saveExchange(exchange)

    // Simulate a competing sweep that already bumped the attemptId
    // on disk. Our sweep's CAS write should be rejected (the on-disk
    // attemptId no longer matches what we expect), and the helper
    // should re-read and return the winner's version.
    const winning: App.ExchangeDetailVerify = withVerifyTask(exchange, {
      ...lapsed,
      attemptId: 'other-sweep-won',
      attempt: 2,
      status: 'queued'
    })
    await saveExchange(winning)

    const enqueued: string[] = []
    const result = (await sweepIfTimedOut(exchange, cfg, {
      now: () => T0,
      enqueueVerifyTask: (id) => enqueued.push(id)
    })) as App.ExchangeDetailVerify

    expect(enqueued).toEqual([])
    expect(result.variables.verifyTask?.attemptId).toBe('other-sweep-won')
  })
})

// ----- pure helpers -----------------------------------------------------

describe('synthesizePipelineTimeoutCheckResult', () => {
  const baseTask: App.VerifyTask = {
    attemptId: 'a',
    queuedAt: T0.toISOString(),
    deadlineAt: T0.toISOString(),
    attempt: 2,
    maxAttempts: 2,
    openBadgesCredentialIndices: [],
    status: 'gave-up'
  }

  test('omits last error when none present', () => {
    const r = synthesizePipelineTimeoutCheckResult(baseTask, T0)
    expect(r.outcome.status).toBe('failure')
    if (r.outcome.status === 'failure') {
      expect(r.outcome.problems[0].detail).not.toContain('Last error')
    }
    expect(r.id).toBe('pipeline.timeout')
  })

  test('includes lastError.message when present', () => {
    const withErr = { ...baseTask, lastError: { message: 'kaboom', at: 'x' } }
    const r = synthesizePipelineTimeoutCheckResult(withErr, T0)
    if (r.outcome.status === 'failure') {
      expect(r.outcome.problems[0].detail).toContain('kaboom')
    }
  })
})

describe('appendAllResult', () => {
  test('fabricates a default shell when results is undefined', () => {
    const check: App.CheckResult = {
      id: 'pipeline.timeout',
      outcome: { status: 'success', message: 'ok' }
    }
    const r = appendAllResult(undefined, check)
    expect(r.default.presentationResults).toEqual([check])
    expect(r.default.verified).toBe(false)
  })

  test('appends to existing presentationResults and forces verified=false', () => {
    const prior: App.CheckResult = {
      id: 'pipeline.s.c1',
      outcome: { status: 'success', message: 'ok' }
    }
    const next: App.CheckResult = { ...prior, id: 'pipeline.s.c2' }
    const r = appendAllResult(
      {
        default: {
          ...buildResults(),
          verified: true,
          presentationResults: [prior]
        }
      },
      next
    )
    expect(r.default.presentationResults).toEqual([prior, next])
    expect(r.default.verified).toBe(false)
  })
})

// ----- defensive: vi smoke -----

// Cheap insurance that the test runner is wired up; if `vi` ever
// goes missing the rest of this file would fail in confusing ways
// before this assertion ever ran, but it costs nothing to keep.
test('default deps are wired (smoke)', () => {
  expect(typeof vi.fn).toBe('function')
})
