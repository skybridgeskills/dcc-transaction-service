import { describe, expect, test } from 'vitest'
import {
  anyTiming,
  failureDetail,
  groupByPhase,
  isPhaseAllSkipped,
  phaseOrder
} from './helpers.js'

const buildSummary = (
  partial: Partial<App.SuiteSummary> & { id: string; suite: string }
): App.SuiteSummary => ({
  phase: 'cryptographic',
  status: 'success',
  verified: true,
  message: '1 of 1 checks passed',
  counts: { passed: 1, failed: 0, skipped: 0 },
  ...partial
})

const buildCheck = (
  partial: Partial<App.CheckResult> & { id: string }
): App.CheckResult => ({
  outcome: { status: 'success', message: 'ok' },
  ...partial
})

describe('phaseOrder', () => {
  test('lists all four canonical phases plus the unknown bucket', () => {
    expect(phaseOrder).toEqual([
      'cryptographic',
      'trust',
      'recognition',
      'semantic',
      'unknown'
    ])
  })
})

describe('groupByPhase', () => {
  test('buckets summaries under their declared phase', () => {
    const cr = {
      verified: true,
      verifiableCredential: {} as never,
      results: [],
      summary: [
        buildSummary({ id: 'cryptographic.core', suite: 'core' }),
        buildSummary({
          id: 'trust.registry',
          suite: 'registry',
          phase: 'trust'
        }),
        buildSummary({
          id: 'semantic.openbadges',
          suite: 'openbadges',
          phase: 'semantic'
        })
      ]
    } satisfies App.CredentialVerificationResult

    const grouped = groupByPhase(cr)
    expect(grouped.cryptographic).toHaveLength(1)
    expect(grouped.trust).toHaveLength(1)
    expect(grouped.semantic).toHaveLength(1)
    expect(grouped.recognition).toEqual([])
    expect(grouped.unknown).toEqual([])
  })

  test('routes off-list phases to the unknown bucket', () => {
    const cr = {
      verified: true,
      verifiableCredential: {} as never,
      results: [],
      summary: [
        buildSummary({
          id: 'foo.bar',
          suite: 'bar',
          phase: 'unknown'
        })
      ]
    } satisfies App.CredentialVerificationResult

    expect(groupByPhase(cr).unknown).toHaveLength(1)
  })

  test('returns empty buckets when summary is empty', () => {
    const grouped = groupByPhase({
      verified: true,
      verifiableCredential: {} as never,
      results: [],
      summary: []
    })
    expect(grouped.cryptographic).toEqual([])
    expect(grouped.unknown).toEqual([])
  })
})

describe('failureDetail', () => {
  test('returns checks whose id matches the summary id or its children', () => {
    const summary = buildSummary({
      id: 'cryptographic.proof',
      suite: 'proof'
    })
    const cr: App.CredentialVerificationResult = {
      verified: true,
      verifiableCredential: {} as never,
      results: [
        buildCheck({ id: 'cryptographic.proof' }),
        buildCheck({ id: 'cryptographic.proof.signature-valid' }),
        buildCheck({ id: 'cryptographic.core.id-valid' })
      ]
    }
    const matches = failureDetail(cr, summary)
    expect(matches).toHaveLength(2)
    expect(matches.map((r) => r.id)).toEqual([
      'cryptographic.proof',
      'cryptographic.proof.signature-valid'
    ])
  })

  test('returns no matches when no check id starts with the summary id', () => {
    const summary = buildSummary({ id: 'cryptographic.core', suite: 'core' })
    const cr: App.CredentialVerificationResult = {
      verified: true,
      verifiableCredential: {} as never,
      results: [buildCheck({ id: 'cryptographic.proof.signature' })],
      summary: []
    }
    expect(failureDetail(cr, summary)).toEqual([])
  })
})

describe('anyTiming', () => {
  const tt = {
    startedAt: '2026-04-19T00:00:00Z',
    endedAt: '2026-04-19T00:00:00.001Z',
    durationMs: 1
  }

  test('returns false when no timing fields are populated', () => {
    const result: App.VerificationResult = {
      verified: true,
      presentationResults: [],
      credentialResults: [],
      matchedCredentials: [],
      summary: []
    }
    expect(anyTiming(result)).toBe(false)
  })

  test('returns true when any per-suite timing is present', () => {
    const result: App.VerificationResult = {
      verified: true,
      presentationResults: [],
      credentialResults: [
        {
          verified: true,
          verifiableCredential: {} as never,
          results: [],
          summary: [
            buildSummary({
              id: 'cryptographic.core',
              suite: 'core',
              timing: tt
            })
          ]
        }
      ],
      matchedCredentials: [],
      summary: []
    }
    expect(anyTiming(result)).toBe(true)
  })

  test('returns true when only the top-level timing is present', () => {
    const result: App.VerificationResult = {
      verified: true,
      presentationResults: [],
      credentialResults: [],
      matchedCredentials: [],
      summary: [],
      timing: tt
    }
    expect(anyTiming(result)).toBe(true)
  })
})

describe('isPhaseAllSkipped', () => {
  test('returns false for an empty array', () => {
    expect(isPhaseAllSkipped([])).toBe(false)
  })

  test('returns false when at least one summary is non-skipped', () => {
    expect(
      isPhaseAllSkipped([
        buildSummary({
          id: 'a',
          suite: 'a',
          status: 'skipped',
          verified: false,
          counts: { passed: 0, failed: 0, skipped: 1 }
        }),
        buildSummary({ id: 'b', suite: 'b' })
      ])
    ).toBe(false)
  })

  test('returns true when every summary is skipped', () => {
    expect(
      isPhaseAllSkipped([
        buildSummary({
          id: 'a',
          suite: 'a',
          status: 'skipped',
          verified: false,
          counts: { passed: 0, failed: 0, skipped: 1 }
        }),
        buildSummary({
          id: 'b',
          suite: 'b',
          status: 'skipped',
          verified: false,
          counts: { passed: 0, failed: 0, skipped: 1 }
        })
      ])
    ).toBe(true)
  })
})
