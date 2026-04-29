import { describe, test, expect } from 'vitest'
import { z } from 'zod'
import { JsonLdField, JsonLdFieldAllowEmpty, JsonLdSingularField } from './jsonld-field.js'

describe('JsonLdField', () => {
  const field = JsonLdField(z.string())

  test('normalizes singular value to array', () => {
    expect(field.parse('Foo')).toEqual(['Foo'])
  })

  test('passes through array of one', () => {
    expect(field.parse(['Foo'])).toEqual(['Foo'])
  })

  test('passes through array of multiple', () => {
    expect(field.parse(['Foo', 'Bar'])).toEqual(['Foo', 'Bar'])
  })

  test('rejects empty array', () => {
    expect(() => field.parse([])).toThrow()
  })

  test('rejects wrong type', () => {
    expect(() => field.parse(123)).toThrow()
  })

  test('rejects null', () => {
    expect(() => field.parse(null)).toThrow()
  })

  test('works with object schemas', () => {
    const objField = JsonLdField(z.object({ id: z.string() }))
    expect(objField.parse({ id: 'a' })).toEqual([{ id: 'a' }])
    expect(objField.parse([{ id: 'a' }, { id: 'b' }])).toEqual([{ id: 'a' }, { id: 'b' }])
  })

  test('output is typed as array', () => {
    const result = field.parse('test')
    const _typeCheck: string[] = result
    expect(Array.isArray(_typeCheck)).toBe(true)
  })
})

describe('JsonLdFieldAllowEmpty', () => {
  const field = JsonLdFieldAllowEmpty(z.string())

  test('normalizes singular value to array', () => {
    expect(field.parse('Foo')).toEqual(['Foo'])
  })

  test('passes through array of one', () => {
    expect(field.parse(['Foo'])).toEqual(['Foo'])
  })

  test('passes through array of multiple', () => {
    expect(field.parse(['Foo', 'Bar'])).toEqual(['Foo', 'Bar'])
  })

  test('allows empty array', () => {
    expect(field.parse([])).toEqual([])
  })

  test('rejects wrong type', () => {
    expect(() => field.parse(123)).toThrow()
  })

  test('rejects array of wrong type', () => {
    expect(() => field.parse([123])).toThrow()
  })
})

describe('JsonLdSingularField', () => {
  const field = JsonLdSingularField(z.string())

  test('normalizes singular value to array of one', () => {
    expect(field.parse('Foo')).toEqual(['Foo'])
  })

  test('passes through array of one', () => {
    expect(field.parse(['Foo'])).toEqual(['Foo'])
  })

  test('rejects array of multiple', () => {
    expect(() => field.parse(['Foo', 'Bar'])).toThrow()
  })

  test('rejects empty array', () => {
    expect(() => field.parse([])).toThrow()
  })

  test('rejects wrong type', () => {
    expect(() => field.parse(123)).toThrow()
  })
})
