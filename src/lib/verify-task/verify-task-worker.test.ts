import type {
  CheckResult as CoreCheckResult,
  CredentialVerificationResult,
  VerifiableCredential,
  VerifyCredentialCall
} from '@digitalcredentials/verifier-core'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  clearKeyv,
  getExchangeData,
  initializeTransactionManager,
  saveExchange,
  saveExchangeWithCAS as realSaveExchangeWithCAS
} from '../../transactionManager.js'
import {
  createMockCredential,
  createMockExchange
} from '../../test-fixtures/testData.js'
import { newVerifyTask } from './verify-task.js'
import {
  mergeOpenBadgesResultsAt,
  processVerifyTask,
  withVerifyTask,
  type ProcessVerifyTaskDeps
} from './verify-task-worker.js'

// ----- pure helpers -----------------------------------------------------

const proofSummary: App.SuiteSummary = {
  id: 'cryptographic.proof',
  phase: 'cryptographic',
  suite: 'proof',
  status: 'success',
  verified: true,
  message: '1 of 1 checks passed',
  counts: { passed: 1, failed: 0, skipped: 0 }
}

const phaseFor = (suite: string): string =>
  suite === 'openbadges' ? 'semantic' : 'cryptographic'

const idFor = (suite: string, check: string): string => {
  const localPart = check.includes('.')
    ? check.split('.').slice(1).join('.')
    : check
  return `${phaseFor(suite)}.${suite}.${localPart}`
}

/**
 * Producer-side helpers used to build `App.CheckResult` literals
 * for tests in this file. Tests that hand the same id values to a
 * mocked `verifyCredential` (whose return type is verifier-core's
 * still-`check`/`suite`-bearing `CheckResult`) call {@link toCoreCheck}
 * to add those legacy fields back at the boundary.
 */
const checkSuccess = (suite: string, check: string): App.CheckResult => ({
  id: idFor(suite, check),
  outcome: { status: 'success', message: 'ok' }
})

const checkFailure = (suite: string, check: string): App.CheckResult => ({
  id: idFor(suite, check),
  outcome: {
    status: 'failure',
    problems: [{ type: 'urn:test', title: 't', detail: 'd' }]
  },
  fatal: true
})

/** Adapt an `App.CheckResult` to verifier-core's still-required `check`/`suite`. */
const toCoreCheck = (
  r: App.CheckResult,
  suite: string,
  check: string
): CoreCheckResult => ({
  ...r,
  id: r.id,
  suite,
  check
})

const buildBaseResult = (
  perCredVerified: boolean[]
): App.VerificationResult => ({
  verified: perCredVerified.every(Boolean),
  presentationResults: [checkSuccess('proof', 'proof.signature-valid')],
  credentialResults: perCredVerified.map((v) => ({
    verified: v,
    verifiableCredential: createMockCredential(),
    results: v
      ? [checkSuccess('proof', 'proof.signature-valid')]
      : [checkFailure('proof', 'proof.signature-valid')],
    summary: [proofSummary]
  })),
  matchedCredentials: [],
  summary: [proofSummary]
})

// ----- mergeOpenBadgesResultsAt (pure) ----------------------------------

describe('mergeOpenBadgesResultsAt', () => {
  const obSummary: App.SuiteSummary = {
    id: 'semantic.openbadges',
    phase: 'semantic',
    suite: 'openbadges',
    status: 'success',
    verified: true,
    message: '1 of 1 checks passed',
    counts: { passed: 1, failed: 0, skipped: 0 }
  }

  test('appends OB results, ANDs verified', () => {
    const merged = buildBaseResult([true])
    const ob = checkSuccess('openbadges', 'openbadges.result-ref')
    const next = mergeOpenBadgesResultsAt(merged, 0, {
      verified: true,
      results: [ob],
      summary: [obSummary]
    })

    expect(next.credentialResults[0].verified).toBe(true)
    expect(next.credentialResults[0].results).toHaveLength(2)
    expect(next.credentialResults[0].results[1]).toBe(ob)
    expect(next.verified).toBe(true)
  })

  test('OB failure flips per-cred verified and overall verified to false', () => {
    const merged = buildBaseResult([true])
    const ob = checkFailure('openbadges', 'openbadges.result-ref')
    const next = mergeOpenBadgesResultsAt(merged, 0, {
      verified: false,
      results: [ob],
      summary: [{ ...obSummary, status: 'failure', verified: false }]
    })

    expect(next.credentialResults[0].verified).toBe(false)
    expect(next.verified).toBe(false)
  })

  test('does not mutate input', () => {
    const merged = buildBaseResult([true])
    const credResultsLen = merged.credentialResults[0].results.length
    mergeOpenBadgesResultsAt(merged, 0, {
      verified: true,
      results: [checkSuccess('openbadges', 'x')],
      summary: [obSummary]
    })
    expect(merged.credentialResults[0].results).toHaveLength(credResultsLen)
  })

  test('out-of-range index returns input unchanged', () => {
    const merged = buildBaseResult([true])
    const next = mergeOpenBadgesResultsAt(merged, 99, {
      verified: false,
      results: [checkFailure('openbadges', 'x')],
      summary: [obSummary]
    })
    expect(next).toBe(merged)
  })

  test('overall verified can never flip from false to true', () => {
    const merged = buildBaseResult([true, false])
    const next = mergeOpenBadgesResultsAt(merged, 0, {
      verified: true,
      results: [checkSuccess('openbadges', 'x')],
      summary: [obSummary]
    })
    expect(next.verified).toBe(false)
  })

  test('concatenates per-credential summary[] from sync + OB passes', () => {
    const merged = buildBaseResult([true])
    const next = mergeOpenBadgesResultsAt(merged, 0, {
      verified: true,
      results: [checkSuccess('openbadges', 'x')],
      summary: [obSummary]
    })

    expect(next.credentialResults[0].summary).toEqual([
      proofSummary,
      obSummary
    ])
  })
})

// ----- processVerifyTask (worker, with injected deps) ------------------

interface WorkerHarness {
  exchange: App.ExchangeDetailVerify
  task: App.VerifyTask
  deps: ProcessVerifyTaskDeps
  verifyCalls: VerifyCredentialCall[]
}

const setupWorker = async (opts: {
  perCredVerified?: boolean[]
  obIndices?: number[]
  verifyCredential?: ProcessVerifyTaskDeps['verifyCredential']
  taskOverrides?: Partial<App.VerifyTask>
  preCommit?: (
    exchange: App.ExchangeDetailVerify
  ) => App.ExchangeDetailVerify
}): Promise<WorkerHarness> => {
  const perCred = opts.perCredVerified ?? [true]
  const obIndices = opts.obIndices ?? [0]
  const baseResult = buildBaseResult(perCred)

  const baseTask = newVerifyTask({
    openBadgesCredentialIndices: obIndices,
    deadlineMs: 60_000,
    maxAttempts: 2
  })
  const task = { ...baseTask, ...opts.taskOverrides }

  let exchange: App.ExchangeDetailVerify = {
    ...createMockExchange(),
    state: perCred.every(Boolean) ? 'complete' : 'invalid',
    variables: {
      ...createMockExchange().variables,
      results: { default: baseResult },
      verifyTask: task
    }
  }
  if (opts.preCommit) exchange = opts.preCommit(exchange)
  await saveExchange(exchange)

  const verifyCalls: VerifyCredentialCall[] = []
  const inner =
    opts.verifyCredential ??
    (async (call: VerifyCredentialCall) =>
      ({
        verified: true,
        verifiableCredential: call.credential as VerifiableCredential,
        results: [
          toCoreCheck(
            checkSuccess('openbadges', 'openbadges.result-ref'),
            'openbadges',
            'openbadges.result-ref'
          )
        ],
        summary: [
          {
            id: 'semantic.openbadges',
            phase: 'semantic',
            suite: 'openbadges',
            status: 'success',
            verified: true,
            message: '1 of 1 checks passed',
            counts: { passed: 1, failed: 0, skipped: 0 }
          }
        ]
      }) satisfies CredentialVerificationResult)

  const deps: ProcessVerifyTaskDeps = {
    loadExchange: loadVerify,
    saveExchangeWithCAS: realSaveExchangeWithCAS,
    verifyCredential: (call) => {
      verifyCalls.push(call)
      return inner(call)
    },
    resolveRegistries: () => [],
    openbadgesSuitesFor: () => []
  }

  return { exchange, task, deps, verifyCalls }
}

describe('processVerifyTask', () => {
  beforeEach(() => {
    clearKeyv()
    initializeTransactionManager()
  })
  afterEach(() => {
    clearKeyv()
  })

  test('happy path: OB checks pass → succeeded + complete', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      perCredVerified: [true]
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    expect(verifyCalls).toHaveLength(1)
    const stored = await loadVerify(exchange.exchangeId)
    expect(stored.variables.verifyTask?.status).toBe('succeeded')
    expect(stored.state).toBe('complete')
    expect(stored.variables.results?.default.credentialResults[0].verified).toBe(
      true
    )
  })

  test('OB check fails (verified=false) → succeeded task, invalid exchange', async () => {
    const { exchange, deps } = await setupWorker({
      perCredVerified: [true],
      verifyCredential: async (call) => ({
        verified: false,
        verifiableCredential: call.credential as VerifiableCredential,
        results: [
          toCoreCheck(
            checkFailure('openbadges', 'openbadges.result-ref'),
            'openbadges',
            'openbadges.result-ref'
          )
        ],
        summary: [
          {
            id: 'semantic.openbadges',
            phase: 'semantic',
            suite: 'openbadges',
            status: 'failure',
            verified: false,
            message: '1 of 1 checks failed (0 passed)',
            counts: { passed: 0, failed: 1, skipped: 0 }
          }
        ]
      })
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    const stored = await loadVerify(exchange.exchangeId)
    expect(stored.variables.verifyTask?.status).toBe('succeeded')
    expect(stored.state).toBe('invalid')
    expect(stored.variables.results?.default.verified).toBe(false)
    expect(stored.variables.results?.default.credentialResults[0].verified).toBe(
      false
    )
  })

  test('worker error → failed task; exchange state unchanged', async () => {
    const { exchange, deps } = await setupWorker({
      perCredVerified: [true],
      verifyCredential: async () => {
        throw new Error('network down')
      }
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('failed')
    const stored = await loadVerify(exchange.exchangeId)
    expect(stored.variables.verifyTask?.status).toBe('failed')
    expect(stored.variables.verifyTask?.lastError?.message).toBe('network down')
    expect(stored.state).toBe('complete')
  })

  test('CAS mismatch at final commit: stale write is silently dropped', async () => {
    const { exchange, task, deps } = await setupWorker({
      perCredVerified: [true]
    })

    const sweptDeps: ProcessVerifyTaskDeps = {
      ...deps,
      verifyCredential: async (call) => {
        const stored = await loadVerify(exchange.exchangeId)
        await saveExchange(
          withVerifyTask(stored, {
            ...task,
            attemptId: 'rebumped-by-sweep',
            attempt: 2
          })
        )
        return {
          verified: true,
          verifiableCredential: call.credential as VerifiableCredential,
          results: [toCoreCheck(checkSuccess('openbadges', 'x'), 'openbadges', 'x')],
          summary: [
            {
              id: 'semantic.openbadges',
              phase: 'semantic',
              suite: 'openbadges',
              status: 'success',
              verified: true,
              message: '1 of 1 checks passed',
              counts: { passed: 1, failed: 0, skipped: 0 }
            }
          ]
        }
      }
    }

    const outcome = await processVerifyTask(exchange.exchangeId, sweptDeps)

    expect(outcome).toBe('stale')
    const stored = await loadVerify(exchange.exchangeId)
    expect(stored.variables.verifyTask?.attemptId).toBe('rebumped-by-sweep')
    expect(stored.variables.verifyTask?.status).toBe('queued')
  })

  test('already succeeded: no-op', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      taskOverrides: { status: 'succeeded' }
    })
    const outcome = await processVerifyTask(exchange.exchangeId, deps)
    expect(outcome).toBe('already-terminal')
    expect(verifyCalls).toHaveLength(0)
  })

  test('already gave-up: no-op', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      taskOverrides: { status: 'gave-up' }
    })
    const outcome = await processVerifyTask(exchange.exchangeId, deps)
    expect(outcome).toBe('already-terminal')
    expect(verifyCalls).toHaveLength(0)
  })

  test('exchange not found / evicted: no-op', async () => {
    const { deps } = await setupWorker({ perCredVerified: [true] })
    const outcome = await processVerifyTask('nonexistent-id', deps)
    expect(outcome).toBe('not-found')
  })

  test('mixed VP: only OB indices are sent to verifyCredential', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      perCredVerified: [true, true],
      obIndices: [1] // only the second is OB
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    expect(verifyCalls).toHaveLength(1)
    const stored = await loadVerify(exchange.exchangeId)
    const merged = stored.variables.results!.default
    expect(
      merged.credentialResults[0].results.some((r) =>
        r.id?.startsWith('semantic.openbadges.')
      )
    ).toBe(false)
    expect(
      merged.credentialResults[1].results.some((r) =>
        r.id?.startsWith('semantic.openbadges.')
      )
    ).toBe(true)
  })

  test('empty openBadgesCredentialIndices: succeed without invoking verifier', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      perCredVerified: [true],
      obIndices: []
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    expect(verifyCalls).toHaveLength(0)
    const stored = await loadVerify(exchange.exchangeId)
    expect(stored.variables.verifyTask?.status).toBe('succeeded')
    expect(stored.state).toBe('complete')
  })

  test('forwards variables.options.{verbose,timing} to verifyCredential', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      perCredVerified: [true],
      preCommit: (e) => ({
        ...e,
        variables: {
          ...e.variables,
          options: { verbose: true, timing: true }
        }
      })
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    expect(verifyCalls).toHaveLength(1)
    expect(verifyCalls[0]).toMatchObject({ verbose: true, timing: true })
  })

  test('omits verbose/timing keys when variables.options is unset', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      perCredVerified: [true]
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    expect(verifyCalls).toHaveLength(1)
    expect('verbose' in verifyCalls[0]).toBe(false)
    expect('timing' in verifyCalls[0]).toBe(false)
  })

  test('default deps wire getVerifier; only override what the test needs', async () => {
    // Smoke test: a fake loader + fake CAS + spy verifier work together.
    const { exchange } = await setupWorker({ perCredVerified: [true] })
    const spy = vi.fn().mockResolvedValue({
      verified: true,
      verifiableCredential: {} as unknown as VerifiableCredential,
      results: [],
      summary: []
    } satisfies CredentialVerificationResult)
    const outcome = await processVerifyTask(exchange.exchangeId, {
      loadExchange: loadVerify,
      saveExchangeWithCAS: realSaveExchangeWithCAS,
      verifyCredential: spy,
      resolveRegistries: () => [],
      openbadgesSuitesFor: () => []
    })
    expect(outcome).toBe('succeeded')
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

const loadVerify = async (id: string): Promise<App.ExchangeDetailVerify> =>
  (await getExchangeData(id, 'verify')) as App.ExchangeDetailVerify
