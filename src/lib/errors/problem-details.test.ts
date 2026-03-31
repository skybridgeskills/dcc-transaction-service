import { describe, test, expect } from 'vitest'
import { z } from 'zod'
import {
  zodProblemDetails,
  problemDetailResponse,
  PARSING_ERROR,
  MALFORMED_VALUE_ERROR,
  RANGE_ERROR
} from './problem-details.js'
import { parseCredential } from '../data/verifiable-credential/schema.js'

function issuesFrom(schema: z.ZodType, value: unknown) {
  const result = schema.safeParse(value)
  if (result.success) throw new Error('Expected parse to fail')
  return result.error.issues
}

describe('zodProblemDetails', () => {
  test('maps invalid_type to MALFORMED_VALUE_ERROR', () => {
    const issues = issuesFrom(z.string(), 123)
    const details = zodProblemDetails(issues)

    expect(details).toHaveLength(1)
    expect(details[0].title).toBe(MALFORMED_VALUE_ERROR)
    expect(details[0].type).toBe(
      'https://www.w3.org/TR/vc-data-model#MALFORMED_VALUE_ERROR'
    )
    expect(details[0].status).toBe(400)
  })

  test('maps too_small to RANGE_ERROR', () => {
    const issues = issuesFrom(z.array(z.string()).min(1), [])
    const details = zodProblemDetails(issues)

    expect(details).toHaveLength(1)
    expect(details[0].title).toBe(RANGE_ERROR)
  })

  test('maps too_big to RANGE_ERROR', () => {
    const issues = issuesFrom(z.string().max(2), 'abc')
    const details = zodProblemDetails(issues)

    expect(details).toHaveLength(1)
    expect(details[0].title).toBe(RANGE_ERROR)
  })

  test('maps custom_error (from refine) to PARSING_ERROR', () => {
    const schema = z.string().refine((s) => s === 'yes', {
      message: 'must be yes'
    })
    const issues = issuesFrom(schema, 'no')
    const details = zodProblemDetails(issues)

    expect(details).toHaveLength(1)
    expect(details[0].title).toBe(PARSING_ERROR)
  })

  test('includes path in detail message', () => {
    const schema = z.object({ holder: z.string() })
    const issues = issuesFrom(schema, { holder: 123 })
    const details = zodProblemDetails(issues)

    expect(details[0].detail).toMatch(/at holder:/)
  })

  test('includes nested path with array index', () => {
    const schema = z.object({
      credentials: z.array(z.object({ type: z.string() }))
    })
    const issues = issuesFrom(schema, { credentials: [{ type: 123 }] })
    const details = zodProblemDetails(issues)

    expect(details[0].detail).toMatch(/at credentials\[0\]\.type:/)
  })

  test('uses prefix when provided', () => {
    const issues = issuesFrom(z.string(), 123)
    const details = zodProblemDetails(issues, 'credential 2')

    expect(details[0].detail).toMatch(/^at credential 2:/)
  })

  test('combines prefix with path', () => {
    const schema = z.object({ type: z.string() })
    const issues = issuesFrom(schema, { type: 123 })
    const details = zodProblemDetails(issues, 'credential 0')

    expect(details[0].detail).toMatch(/^at credential 0\.type:/)
  })

  test('handles multiple issues', () => {
    const schema = z.object({ a: z.string(), b: z.number() })
    const issues = issuesFrom(schema, { a: 123, b: 'oops' })
    const details = zodProblemDetails(issues)

    expect(details).toHaveLength(2)
  })

  test('returns empty array for empty issues', () => {
    expect(zodProblemDetails([])).toEqual([])
  })
})

describe('zodProblemDetails — union traversal', () => {
  test('single union produces summary + per-branch details', () => {
    const schema = z.union([z.string(), z.number()])
    const details = zodProblemDetails(issuesFrom(schema, true))

    expect(details[0]).toMatchObject({
      title: PARSING_ERROR,
      detail: '(A): Input did not match any available schema'
    })
    expect(details[1]).toMatchObject({
      title: MALFORMED_VALUE_ERROR,
      detail: expect.stringMatching(/^\(A\.1\).*Expected string/)
    })
    expect(details[2]).toMatchObject({
      title: MALFORMED_VALUE_ERROR,
      detail: expect.stringMatching(/^\(A\.2\).*Expected number/)
    })
  })

  test('union at a nested path includes path in summary', () => {
    const schema = z.object({ issuer: z.union([z.string(), z.number()]) })
    const details = zodProblemDetails(issuesFrom(schema, { issuer: true }))

    expect(details[0].detail).toBe(
      '(A) at issuer: Input did not match any available schema'
    )
    expect(details[1].detail).toMatch(/^\(A\.1\) at issuer:/)
    expect(details[2].detail).toMatch(/^\(A\.2\) at issuer:/)
  })

  test('nested union (union inside union) produces hierarchical labels', () => {
    const inner = z.union([z.string(), z.literal(42)])
    const outer = z.union([inner, z.boolean()])
    const details = zodProblemDetails(issuesFrom(outer, []))

    const labels = details.map((d) => d.detail.match(/^\(([^)]+)\)/)?.[1])
    expect(labels[0]).toBe('A')
    // Branch 0 is itself a union, so it expands to A.1.a (inner union summary)
    expect(labels).toContain('A.1.a')
    // Branch 1 is a leaf (boolean), label = A.2
    expect(labels).toContain('A.2')
  })

  test('depth cap at 3 levels stops recursion', () => {
    const level3 = z.union([z.literal('x'), z.literal('y')])
    const level2 = z.union([level3, z.literal('m')])
    const level1 = z.union([level2, z.literal('n')])
    const level0 = z.union([level1, z.literal('p')])
    const details = zodProblemDetails(issuesFrom(level0, 999))

    const deepestLabels = details
      .map((d) => d.detail.match(/^\(([^)]+)\)/)?.[1])
      .filter(Boolean)
    const maxSegments = Math.max(
      ...deepestLabels.map((l) => l!.split('.').length)
    )
    expect(maxSegments).toBeLessThanOrEqual(7)

    const cappedSummaries = details.filter(
      (d) =>
        d.detail.includes('Input did not match any available schema') &&
        (d.detail.match(/^\(([^)]+)\)/)?.[1]?.split('.').length ?? 0) >= 5
    )
    expect(cappedSummaries.length).toBeGreaterThanOrEqual(1)
  })

  test('mix of union and non-union issues', () => {
    const schema = z.object({
      name: z.string(),
      value: z.union([z.string(), z.number()])
    })
    const details = zodProblemDetails(
      issuesFrom(schema, { name: 123, value: true })
    )

    const nonUnion = details.find((d) => d.detail.includes('name'))
    expect(nonUnion).toBeDefined()
    expect(nonUnion!.detail).not.toMatch(/^\(/)

    const unionSummary = details.find((d) =>
      d.detail.includes('Input did not match any available schema')
    )
    expect(unionSummary).toBeDefined()
    expect(unionSummary!.detail).toMatch(/^\(A\)/)
  })

  test('prefix works with union errors', () => {
    const schema = z.union([z.string(), z.number()])
    const details = zodProblemDetails(issuesFrom(schema, true), 'credential[0]')

    expect(details[0].detail).toBe(
      '(A) at credential[0]: Input did not match any available schema'
    )
  })

  test('parseCredential returns clear error for invalid credential', () => {
    const badCred = { type: 'NotAVC', issuer: 42 }
    const result = parseCredential(badCred, 'credential[0]')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.problemDetails).toHaveLength(1)
      expect(result.problemDetails[0]).toMatchObject({
        title: PARSING_ERROR,
        status: 400
      })
      expect(result.problemDetails[0].detail).toContain('credential[0]')
      expect(result.problemDetails[0].detail).toContain(
        '@context is required and must be an array'
      )
    }
  })

  test('multiple unions in same array get sequential labels', () => {
    const schema = z.object({
      a: z.union([z.string(), z.number()]),
      b: z.union([z.boolean(), z.null()])
    })
    const details = zodProblemDetails(
      issuesFrom(schema, { a: [], b: 'nope' })
    )

    const summaries = details.filter((d) =>
      d.detail.includes('Input did not match any available schema')
    )
    expect(summaries[0].detail).toMatch(/^\(A\)/)
    expect(summaries[1].detail).toMatch(/^\(B\)/)
  })
})

describe('problemDetailResponse', () => {
  test('produces correct shape', () => {
    const details = zodProblemDetails(issuesFrom(z.string(), 123))
    const response = problemDetailResponse('Invalid presentation', details)

    expect(response).toEqual({
      message: 'Invalid presentation',
      problemDetails: expect.any(Array)
    })
    expect(response.problemDetails).toHaveLength(1)
  })

  test('works with empty details', () => {
    const response = problemDetailResponse('All good', [])
    expect(response).toEqual({ message: 'All good', problemDetails: [] })
  })
})
