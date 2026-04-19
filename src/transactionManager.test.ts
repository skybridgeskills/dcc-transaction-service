import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { newVerifyTask } from './lib/verify-task/index.js'
import { createMockExchange } from './test-fixtures/testData.js'
import {
  clearKeyv,
  initializeTransactionManager,
  saveExchange,
  saveExchangeWithCAS
} from './transactionManager.js'

const mkVerifyExchange = (
  overrides?: Partial<App.ExchangeDetailVerify>
): App.ExchangeDetailVerify => createMockExchange(overrides)

const withTask = (
  exchange: App.ExchangeDetailVerify,
  task: App.VerifyTask
): App.ExchangeDetailVerify => ({
  ...exchange,
  variables: { ...exchange.variables, verifyTask: task }
})

/**
 * Tests for the compare-and-swap save procedure
 * {@link saveExchangeWithCAS} function.
 */
describe('saveExchangeWithCAS', () => {
  beforeEach(() => {
    clearKeyv()
    initializeTransactionManager()
  })
  afterEach(() => {
    clearKeyv()
  })

  test('returns not-found when the exchange has been evicted', async () => {
    const result = await saveExchangeWithCAS(
      'missing-id',
      'any-attempt',
      (cur) => cur
    )
    expect(result).toEqual({ status: 'not-found' })
  })

  test('commits when the persisted attemptId matches', async () => {
    const task = newVerifyTask({
      openBadgesCredentialIndices: [0],
      deadlineMs: 60_000,
      maxAttempts: 2
    })
    const exchange = withTask(mkVerifyExchange(), task)
    await saveExchange(exchange)

    const result = await saveExchangeWithCAS(
      exchange.exchangeId,
      task.attemptId,
      (cur) => {
        const verify = cur as App.ExchangeDetailVerify
        return {
          ...verify,
          state: 'complete',
          variables: {
            ...verify.variables,
            verifyTask: { ...verify.variables.verifyTask!, status: 'succeeded' }
          }
        } satisfies App.ExchangeDetailVerify
      }
    )

    expect(result.status).toBe('committed')
    if (result.status === 'committed') {
      const updated = result.exchange as App.ExchangeDetailVerify
      expect(updated.state).toBe('complete')
      expect(updated.variables.verifyTask?.status).toBe('succeeded')
    }
  })

  test('returns stale and does not write when the persisted attemptId no longer matches', async () => {
    const original = newVerifyTask({
      openBadgesCredentialIndices: [0],
      deadlineMs: 60_000,
      maxAttempts: 2
    })
    const exchange = withTask(mkVerifyExchange(), original)
    await saveExchange(exchange)

    const newer: App.VerifyTask = {
      ...original,
      attemptId: 'sweep-rebump',
      attempt: 2
    }
    await saveExchange(withTask(exchange, newer))

    let updateRan = false
    const result = await saveExchangeWithCAS(
      exchange.exchangeId,
      original.attemptId,
      (cur) => {
        updateRan = true
        return cur
      }
    )

    expect(updateRan).toBe(false)
    expect(result.status).toBe('stale')
    if (result.status === 'stale') {
      const verify = result.current as App.ExchangeDetailVerify
      expect(verify.variables.verifyTask?.attemptId).toBe('sweep-rebump')
    }
  })

  test('returns stale for a verify exchange with no verifyTask attached', async () => {
    const exchange = mkVerifyExchange()
    await saveExchange(exchange)

    const result = await saveExchangeWithCAS(
      exchange.exchangeId,
      'some-attempt',
      (cur) => cur
    )
    expect(result.status).toBe('stale')
  })
})
