import { describe, test, expect } from 'vitest'
import { z } from 'zod'
import {
  zodProblemDetails,
  problemDetailResponse,
  PARSING_ERROR,
  MALFORMED_VALUE_ERROR,
  RANGE_ERROR
} from './problem-details.js'

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
