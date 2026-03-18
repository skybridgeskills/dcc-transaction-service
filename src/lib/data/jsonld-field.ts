import { z, type ZodType } from 'zod'

/**
 * Accepts `T | T[]`, normalizes to `T[]`. Requires at least 1 item.
 *
 * @example
 * const typeField = JsonLdField(z.string())
 * typeField.parse("Foo")           // → ["Foo"]
 * typeField.parse(["Foo", "Bar"])   // → ["Foo", "Bar"]
 * typeField.parse([])               // → ZodError
 */
export function JsonLdField<T>(schema: ZodType<T>) {
  return z
    .union([schema.transform((v): T[] => [v]), z.array(schema)])
    .refine((arr) => arr.length >= 1, { message: 'Must contain at least 1 value' })
}

/**
 * Accepts `T | T[]`, normalizes to `T[]`. Allows 0 or more items.
 *
 * @example
 * const statusField = JsonLdFieldAllowEmpty(statusSchema)
 * statusField.parse(status)         // → [status]
 * statusField.parse([])             // → []
 */
export function JsonLdFieldAllowEmpty<T>(schema: ZodType<T>) {
  return z.union([schema.transform((v): T[] => [v]), z.array(schema)])
}

/**
 * Accepts `T | T[]`, normalizes to `T[]`. Requires exactly 1 item.
 *
 * @example
 * const idField = JsonLdSingularField(z.string())
 * idField.parse("one")             // → ["one"]
 * idField.parse(["one"])           // → ["one"]
 * idField.parse(["a", "b"])        // → ZodError
 */
export function JsonLdSingularField<T>(schema: ZodType<T>) {
  return z
    .union([schema.transform((v): T[] => [v]), z.array(schema)])
    .refine((arr) => arr.length === 1, { message: 'Must contain exactly 1 value' })
}
