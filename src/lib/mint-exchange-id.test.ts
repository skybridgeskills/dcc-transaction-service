/**
 * Tests for the single exchange-id minter.
 *
 * The prefix's whole value is that it travels: it lands in the exchange id, and
 * the exchange id lands in 16 route paths, the interaction URL, every discovery
 * URL and every journal line. So the shape asserted here — `<prefix>-<uuid>`,
 * bare UUID otherwise — is a contract that off-service readers parse.
 */
import { describe, expect, test } from 'vitest'
import { mintExchangeId } from './mint-exchange-id.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

describe('mintExchangeId', () => {
  test('mints a bare UUID when no prefix is supplied — existing callers unchanged', () => {
    expect(mintExchangeId()).toMatch(UUID)
  })

  test('treats an explicit undefined the same as an absent argument', () => {
    expect(mintExchangeId(undefined)).toMatch(UUID)
  })

  test('prepends the prefix with a single hyphen separator', () => {
    const id = mintExchangeId('p1')
    expect(id.startsWith('p1-')).toBe(true)
    expect(id.slice('p1-'.length)).toMatch(UUID)
  })

  test('leaves the UUID half intact, so a short id can be taken from it', () => {
    // Callers disambiguate repeated mints of the same caller-side concept by
    // taking the leading characters of the UUID half. That only works if the
    // prefix — which may itself contain hyphens and underscores — is not mixed
    // into the UUID.
    const prefix = 'batch_47-A2'
    const id = mintExchangeId(prefix)
    expect(id.slice(prefix.length + 1)).toMatch(UUID)
  })

  test('mints a distinct id every call', () => {
    const ids = new Set(Array.from({ length: 50 }, () => mintExchangeId('p1')))
    expect(ids.size).toBe(50)
  })

  test('an empty prefix is treated as no prefix', () => {
    // The schema rejects `''` at the boundary; this pins the helper's own
    // behaviour so a caller bypassing the schema cannot mint a leading hyphen.
    expect(mintExchangeId('')).toMatch(UUID)
  })
})
