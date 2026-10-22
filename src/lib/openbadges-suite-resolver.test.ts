/**
 * The resolver is the one piece of the async Open Badges pass that every
 * worker test replaces (`openbadgesSuitesFor: () => []`), so a broken import
 * here — `[undefined]` after verifier-core moved `openBadgesSuite` to its
 * `/openbadges/schema` entry point — would pass the whole worker suite and
 * crash in production. This test is the only thing standing between the two.
 */
import { describe, expect, test } from 'vitest'
import { openbadgesSuitesFor } from './openbadges-suite-resolver.js'

describe('openbadgesSuitesFor', () => {
  test('returns at least one defined suite with an id and checks', () => {
    const suites = openbadgesSuitesFor({})
    expect(suites.length).toBeGreaterThan(0)
    for (const suite of suites) {
      expect(suite).toBeDefined()
      expect(typeof suite.id).toBe('string')
      expect(Array.isArray(suite.checks)).toBe(true)
      expect(suite.checks.length).toBeGreaterThan(0)
    }
  })
})
