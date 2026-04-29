/**
 * Equivalence test for the {@link refoldSummary} re-export.
 *
 * The wrapper is a single chokepoint for verifier-core's
 * `foldCheckResults`; this test just guards that the upstream symbol
 * keeps the expected signature and behavior across `verifier-core`
 * upgrades. If the upstream contract ever changes — return shape,
 * verbose default, suite-list arity — this test will fail and force a
 * deliberate update to every refold call site.
 */
import { describe, expect, test } from 'vitest'
import {
  foldCheckResults,
  type CheckResult,
  type VerificationSuite
} from '@digitalcredentials/verifier-core'
import { refoldSummary } from './refold.js'

const ts = '2026-04-19T12:00:00.000Z'

const fakeCoreSuite: VerificationSuite = {
  id: 'core',
  name: 'Core',
  phase: 'cryptographic',
  checks: [
    {
      id: 'core.context-exists',
      name: 'context-exists',
      execute: async () => ({ status: 'success', message: 'ok' })
    },
    {
      id: 'core.proof-exists',
      name: 'proof-exists',
      execute: async () => ({ status: 'success', message: 'ok' })
    }
  ]
}

const fakeChecks: CheckResult[] = [
  {
    id: 'cryptographic.core.context-exists',
    suite: 'core',
    check: 'core.context-exists',
    outcome: { status: 'success', message: '@context present' },
    fatal: false,
    timing: { startedAt: ts, endedAt: ts, durationMs: 0 }
  },
  {
    id: 'cryptographic.core.proof-exists',
    suite: 'core',
    check: 'core.proof-exists',
    outcome: { status: 'success', message: 'proof present' },
    fatal: false,
    timing: { startedAt: ts, endedAt: ts, durationMs: 0 }
  }
]

describe('refoldSummary', () => {
  test('is the same function as verifier-core foldCheckResults', () => {
    expect(refoldSummary).toBe(foldCheckResults)
  })

  test('produces the same output as foldCheckResults for the same input', () => {
    const upstream = foldCheckResults(fakeChecks, [fakeCoreSuite])
    const wrapped = refoldSummary(fakeChecks, [fakeCoreSuite])
    expect(wrapped).toEqual(upstream)
  })

  test('honors the verbose flag (passthrough)', () => {
    const folded = refoldSummary(fakeChecks, [fakeCoreSuite], {
      verbose: false
    })
    // Two passing checks, neither failure nor explicit-skip → folded away.
    expect(folded.results).toHaveLength(0)
    expect(folded.summaries).toHaveLength(1)
    expect(folded.summaries[0]).toMatchObject({
      id: 'cryptographic.core',
      phase: 'cryptographic',
      suite: 'core',
      status: 'success',
      verified: true,
      counts: { passed: 2, failed: 0, skipped: 0 }
    })

    const verbose = refoldSummary(fakeChecks, [fakeCoreSuite], {
      verbose: true
    })
    expect(verbose.results).toHaveLength(2)
  })
})
