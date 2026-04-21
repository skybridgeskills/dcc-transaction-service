import { describe, expect, test } from 'vitest'
import {
  applyFix,
  chainFixes,
  compatFlagEnabled,
  isCompatFlagEnabled
} from './apply.js'
import { compatibilityCheckResult, type CompatibilityResult } from './types.js'

describe('chainFixes', () => {
  test('returns input unchanged with no fixes', () => {
    const input = { a: 1 }
    const out = chainFixes(input)
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })

  test('threads value through fixes in order', () => {
    const out = chainFixes(0, addOne, doubleIt, addOne)
    expect(out.result).toBe(3) // ((0 + 1) * 2) + 1
  })

  test('concatenates log entries in invocation order', () => {
    const out = chainFixes(
      0,
      logOnly('first'),
      logOnly('second'),
      logOnly('third')
    )
    expect(
      out.log.map((l) => l.outcome.status === 'success' && l.outcome.message)
    ).toEqual(['first', 'second', 'third'])
  })

  test('accepts a no-op fix that returns the same value with no log', () => {
    const input = { a: 1 }
    const out = chainFixes(input, identity, identity)
    expect(out.result).toBe(input)
    expect(out.log).toEqual([])
  })
})

describe('applyFix', () => {
  test('pushes log entries onto the provided array and returns the result', () => {
    const log: App.CheckResult[] = []
    const result = applyFix(addOne(0), log)
    expect(result).toBe(1)
    expect(log).toHaveLength(1)
  })

  test('appends in order across multiple calls', () => {
    const log: App.CheckResult[] = []
    applyFix(logOnly('first')(0), log)
    applyFix(logOnly('second')(0), log)
    expect(log).toHaveLength(2)
    expect(log[1].outcome.status === 'success' && log[1].outcome.message).toBe(
      'second'
    )
  })

  test('does not mutate the fix object passed in', () => {
    const fixOutput = addOne(0)
    const originalLogLength = fixOutput.log.length
    const log: App.CheckResult[] = []
    applyFix(fixOutput, log)
    expect(fixOutput.log).toHaveLength(originalLogLength)
  })
})

describe('isCompatFlagEnabled', () => {
  test('undefined falls back to default', () => {
    expect(isCompatFlagEnabled(undefined, true)).toBe(true)
    expect(isCompatFlagEnabled(undefined, false)).toBe(false)
  })

  test('empty string falls back to default', () => {
    expect(isCompatFlagEnabled('', true)).toBe(true)
    expect(isCompatFlagEnabled('   ', false)).toBe(false)
  })

  test('truthy values enable regardless of default', () => {
    for (const raw of ['true', 'TRUE', '1', 'yes', '  Yes  ']) {
      expect(isCompatFlagEnabled(raw, false)).toBe(true)
    }
  })

  test('falsy values disable regardless of default', () => {
    for (const raw of ['false', 'FALSE', '0', 'no', '  No  ']) {
      expect(isCompatFlagEnabled(raw, true)).toBe(false)
    }
  })

  test('unknown value falls back to default', () => {
    expect(isCompatFlagEnabled('maybe', true)).toBe(true)
    expect(isCompatFlagEnabled('maybe', false)).toBe(false)
  })
})

describe('compatibilityCheckResult', () => {
  test('emits an id of the form compat.<fixId> with colons normalized to dots', () => {
    const result = compatibilityCheckResult(
      'verifiable-entity:ed25519-signature-2020-context',
      'msg'
    )
    expect(result.id).toBe(
      'compat.verifiable-entity.ed25519-signature-2020-context'
    )
    // No-colon ids round-trip with just the compat. prefix.
    expect(compatibilityCheckResult('add-one', 'm').id).toBe('compat.add-one')
  })

  test('emits a success outcome with the supplied message', () => {
    const r = compatibilityCheckResult('add-one', 'applied add-one')
    expect(r.outcome.status).toBe('success')
    if (r.outcome.status === 'success') {
      expect(r.outcome.message).toBe('applied add-one')
    }
  })
})

describe('compatFlagEnabled', () => {
  test('reads through to process.env via isCompatFlagEnabled', () => {
    const key = '__COMPAT_TEST_FLAG_DO_NOT_SET__'
    // unset env var → fallback to default
    delete process.env[key]
    expect(compatFlagEnabled(key, true)).toBe(true)
    expect(compatFlagEnabled(key, false)).toBe(false)
  })
})

// --- example "fixes" enabling test of apply orchestration ---

const identity = <T>(input: T): CompatibilityResult<T> => ({
  result: input,
  log: []
})

const addOne = (input: number): CompatibilityResult<number> => ({
  result: input + 1,
  log: [compatibilityCheckResult('add-one', `+1 → ${input + 1}`)]
})

const doubleIt = (input: number): CompatibilityResult<number> => ({
  result: input * 2,
  log: [compatibilityCheckResult('double-it', `*2 → ${input * 2}`)]
})

const logOnly =
  (message: string) =>
  <T>(input: T): CompatibilityResult<T> => ({
    result: input,
    log: [compatibilityCheckResult('log-only', message)]
  })
