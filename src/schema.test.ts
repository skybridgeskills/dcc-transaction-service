/**
 * Tests for {@link baseVariablesSchema} and the nested
 * {@link verifierOptionsSchema}.
 *
 * Focus is on the per-exchange verifier knobs added in the
 * `verifier-core-2-results-consumption` plan: `variables.options.{verbose,
 * timing}`. These flags propagate to every verifier-core call site in the
 * exchange's lifetime, so getting the parse contract right is load-bearing.
 */
import { describe, expect, test } from 'vitest'
import { baseVariablesSchema, verifierOptionsSchema } from './schema.js'

const baseValid = {
  tenantName: 'test-tenant'
}

describe('verifierOptionsSchema', () => {
  test('accepts an empty object', () => {
    expect(verifierOptionsSchema.parse({})).toEqual({})
  })

  test('accepts verbose: true', () => {
    expect(verifierOptionsSchema.parse({ verbose: true })).toEqual({
      verbose: true
    })
  })

  test('accepts timing: true', () => {
    expect(verifierOptionsSchema.parse({ timing: true })).toEqual({
      timing: true
    })
  })

  test('accepts both flags together', () => {
    expect(
      verifierOptionsSchema.parse({ verbose: true, timing: true })
    ).toEqual({ verbose: true, timing: true })
  })

  test('rejects non-boolean verbose (.strict() guards typos at the type)', () => {
    expect(() =>
      verifierOptionsSchema.parse({ verbose: 'yes' })
    ).toThrowError(/expected boolean/i)
  })

  test('rejects unknown nested keys (.strict())', () => {
    expect(() =>
      verifierOptionsSchema.parse({ unknown: true })
    ).toThrowError(/unrecognized/i)
  })
})

describe('baseVariablesSchema with options', () => {
  test('parses without options (back-compat)', () => {
    const out = baseVariablesSchema.parse({ ...baseValid })
    expect(out.options).toBeUndefined()
  })

  test('parses with options.verbose: true', () => {
    const out = baseVariablesSchema.parse({
      ...baseValid,
      options: { verbose: true }
    })
    expect(out.options).toEqual({ verbose: true })
  })

  test('parses with options.timing: true', () => {
    const out = baseVariablesSchema.parse({
      ...baseValid,
      options: { timing: true }
    })
    expect(out.options).toEqual({ timing: true })
  })

  test('parses with both flags', () => {
    const out = baseVariablesSchema.parse({
      ...baseValid,
      options: { verbose: true, timing: true }
    })
    expect(out.options).toEqual({ verbose: true, timing: true })
  })

  test('top-level debug remains parseable alongside options', () => {
    const out = baseVariablesSchema.parse({
      ...baseValid,
      debug: true,
      options: { verbose: true }
    })
    expect(out.debug).toBe(true)
    expect(out.options).toEqual({ verbose: true })
  })

  test('rejects an unknown nested key inside options (.strict())', () => {
    expect(() =>
      baseVariablesSchema.parse({
        ...baseValid,
        options: { verbose: true, unknown: 1 }
      })
    ).toThrowError(/unrecognized/i)
  })
})
