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
import {
  baseVariablesSchema,
  vcApiExchangeCreateSchema,
  verifierOptionsSchema
} from './schema.js'

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

  test('parses with tenantName omitted (server resolves it from the token)', () => {
    const out = baseVariablesSchema.parse({})
    expect(out.tenantName).toBeUndefined()
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

/**
 * `exchangeIdPrefix` is a caller-supplied component of a server-generated
 * identifier, so the schema is the only place it can be rejected: past this
 * point the value is inside an `exchangeId` that appears in 16 route paths, a
 * Keyv key, every discovery URL and every journal line. The naming rule is
 * binding — this is the *service's* noun for the field, and validating it is
 * the consequence of the service using the value in its own logic.
 */
describe('vcApiExchangeCreateSchema · exchangeIdPrefix', () => {
  const validCreate = { variables: { tenantName: 'test-tenant' } }

  test('is optional — existing callers parse unchanged', () => {
    const out = vcApiExchangeCreateSchema.parse(validCreate)
    expect(out.exchangeIdPrefix).toBeUndefined()
  })

  test('is a sibling of variables, not a member of it', () => {
    // It is an instruction to the id minter, not an exchange variable
    // interpolated into a credential template. Zod strips what it does not
    // name, so a caller who nests it gets silence rather than a prefix.
    const out = baseVariablesSchema.parse({
      ...baseValid,
      exchangeIdPrefix: 'p1'
    })
    expect(out).not.toHaveProperty('exchangeIdPrefix')
  })

  test.each(['p1', 'P1', 'run_a1', 'run-a1-b2', '0', 'a'.repeat(32)])(
    'accepts %s',
    (prefix) => {
      expect(
        vcApiExchangeCreateSchema.parse({ ...validCreate, exchangeIdPrefix: prefix })
          .exchangeIdPrefix
      ).toBe(prefix)
    }
  )

  test.each([
    ['a path separator', 'p1/etc'],
    ['a dot', 'p1.2'],
    ['a dot-dot segment', '..'],
    ['a query separator', 'p1?x=1'],
    ['a fragment', 'p1#x'],
    ['whitespace', 'p 1'],
    ['a percent escape', 'p1%2F'],
    ['a colon', 'p1:2'],
    ['33 characters', 'a'.repeat(33)],
    ['an empty string', '']
  ])('rejects %s', (_label, prefix) => {
    expect(() =>
      vcApiExchangeCreateSchema.parse({ ...validCreate, exchangeIdPrefix: prefix })
    ).toThrowError(/exchangeIdPrefix must be 1-32 characters/)
  })

  test('rejects a non-string', () => {
    expect(() =>
      vcApiExchangeCreateSchema.parse({ ...validCreate, exchangeIdPrefix: 42 })
    ).toThrowError()
  })
})
