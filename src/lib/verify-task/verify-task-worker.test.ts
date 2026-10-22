import type {
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
import { decideExchangeState } from '../verify-outcome.js'
import {
  replaceCredentialResultAt,
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

/** Producer-side helpers used to build `App.CheckResult` literals for tests in this file. */
const checkSuccess = (suite: string, check: string): App.CheckResult => ({
  id: idFor(suite, check),
  suite,
  outcome: { status: 'success', message: 'ok' }
})

const checkFailure = (suite: string, check: string): App.CheckResult => ({
  id: idFor(suite, check),
  suite,
  outcome: {
    status: 'failure',
    problems: [{ type: 'urn:test', title: 't', detail: 'd' }]
  },
  fatal: true
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

// ----- replaceCredentialResultAt (pure) ---------------------------------

describe('replaceCredentialResultAt', () => {
  const obSummary: App.SuiteSummary = {
    id: 'semantic.openbadges',
    phase: 'semantic',
    suite: 'openbadges',
    status: 'success',
    message: '1 of 1 checks passed',
    counts: { passed: 1, failed: 0, skipped: 0 }
  }

  /** What the OB pass returns: the default suites' rows plus the OB rows. */
  const obPassResult = (
    verified: boolean
  ): App.CredentialVerificationResult => ({
    verified,
    verifiableCredential: createMockCredential() as VerifiableCredential,
    results: [
      checkSuccess('proof', 'proof.signature-valid'),
      verified
        ? checkSuccess('openbadges', 'openbadges.result-ref')
        : checkFailure('openbadges', 'openbadges.result-ref')
    ],
    summary: [
      proofSummary,
      verified
        ? obSummary
        : {
            ...obSummary,
            status: 'failure',
            fatalFailureAt: idFor('openbadges', 'openbadges.result-ref')
          }
    ],
    recognizedProfile: 'obv3p0.openbadge'
  })

  test('the OB result replaces the credential entry wholesale', () => {
    const current = buildBaseResult([true])
    const ob = obPassResult(true)
    const next = replaceCredentialResultAt(current, 0, ob)

    expect(next.credentialResults[0]).toBe(ob)
    expect(next.credentialResults[0].results).toHaveLength(2)
    expect(next.credentialResults[0].summary).toEqual([proofSummary, obSummary])
    expect(next.verified).toBe(true)
  })

  test('a failing OB check makes the credential and the top level unverified', () => {
    const next = replaceCredentialResultAt(
      buildBaseResult([true]),
      0,
      obPassResult(false)
    )

    expect(next.credentialResults[0].verified).toBe(false)
    expect(next.verified).toBe(false)
  })

  test("a passing OB result leaves the presentation's own fatal failure deciding", () => {
    const current: App.VerificationResult = {
      ...buildBaseResult([true]),
      verified: false,
      presentationResults: [checkFailure('proof', 'proof.signature-valid')]
    }
    const next = replaceCredentialResultAt(current, 0, obPassResult(true))

    expect(next.credentialResults[0].verified).toBe(true)
    expect(next.verified).toBe(false)
  })

  /**
   * ⚠️ Recomputed from the parts, not ANDed with the previous top-level flag:
   * that flag carried the replaced credential's old verdict.
   */
  test('top-level verified is recomputed, so it can become true', () => {
    const current = buildBaseResult([false])
    expect(current.verified).toBe(false)

    const next = replaceCredentialResultAt(current, 0, obPassResult(true))

    expect(next.verified).toBe(true)
  })

  test("other credentials' entries and the other fields are untouched", () => {
    const current: App.VerificationResult = {
      ...buildBaseResult([true, false]),
      claimsValidation: { requiredClaims: [], extractedClaims: {}, matched: true },
      matchedCredentials: ['m']
    }
    const next = replaceCredentialResultAt(current, 0, obPassResult(true))

    expect(next.credentialResults[1]).toBe(current.credentialResults[1])
    expect(next.claimsValidation).toBe(current.claimsValidation)
    expect(next.matchedCredentials).toBe(current.matchedCredentials)
    expect(next.verified).toBe(false)
  })

  test('does not mutate input', () => {
    const current = buildBaseResult([true])
    const before = current.credentialResults[0]
    replaceCredentialResultAt(current, 0, obPassResult(false))
    expect(current.credentialResults[0]).toBe(before)
    expect(current.verified).toBe(true)
  })

  test('out-of-range index returns input unchanged', () => {
    const current = buildBaseResult([true])
    const next = replaceCredentialResultAt(current, 99, obPassResult(false))
    expect(next).toBe(current)
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
          checkSuccess('openbadges', 'openbadges.result-ref')
        ],
        summary: [
          {
            id: 'semantic.openbadges',
            phase: 'semantic',
            suite: 'openbadges',
            status: 'success',
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
          checkFailure('openbadges', 'openbadges.result-ref')
        ],
        summary: [
          {
            id: 'semantic.openbadges',
            phase: 'semantic',
            suite: 'openbadges',
            status: 'failure',
            fatalFailureAt: idFor('openbadges', 'openbadges.result-ref'),
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

  /**
   * ⚠️ The worker must not decide state by its own rule. This result has every
   * `verified` true, so "verified ? complete : invalid" says complete; the
   * shared decision rejects it (trusted issuers set, a fatal registry failure).
   * Getting `invalid` proves the worker went through `decideExchangeState`, the
   * same function the sync path uses.
   */
  test('final state comes from decideExchangeState, not from verified alone', async () => {
    const registryFailure: App.CheckResult = {
      id: 'trust.registry.issuer',
      suite: 'registry',
      outcome: {
        status: 'failure',
        problems: [{ type: 'urn:test', title: 'not registered', detail: 'd' }]
      },
      fatal: true
    }
    const { exchange, deps } = await setupWorker({
      perCredVerified: [true],
      preCommit: (e) => ({
        ...e,
        variables: { ...e.variables, trustedIssuers: ['did:example:trusted'] }
      }),
      verifyCredential: async (call) => ({
        verified: true,
        verifiableCredential: call.credential as VerifiableCredential,
        results: [registryFailure],
        summary: []
      })
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    const stored = await loadVerify(exchange.exchangeId)
    expect(stored.variables.results?.default.verified).toBe(true)
    expect(stored.state).toBe(
      decideExchangeState(stored.variables.results!.default, stored)
    )
    expect(stored.state).toBe('invalid')
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
          results: [checkSuccess('openbadges', 'x')],
          summary: [
            {
              id: 'semantic.openbadges',
              phase: 'semantic',
              suite: 'openbadges',
              status: 'success',
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

  test('forwards variables.options.timing to verifyCredential', async () => {
    const { exchange, deps, verifyCalls } = await setupWorker({
      perCredVerified: [true],
      preCommit: (e) => ({
        ...e,
        variables: {
          ...e.variables,
          options: { timing: true }
        }
      })
    })

    const outcome = await processVerifyTask(exchange.exchangeId, deps)

    expect(outcome).toBe('succeeded')
    expect(verifyCalls).toHaveLength(1)
    expect(verifyCalls[0]).toMatchObject({ timing: true })
    expect('verbose' in verifyCalls[0]).toBe(false)
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
