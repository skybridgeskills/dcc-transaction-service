/**
 * Tests for the registry: definitions are this service's own data, they are
 * validated on the way in, and a lookup never invents an answer.
 */
import { describe, expect, test } from 'vitest'
import {
  PROTOCOL_PROFILES,
  buildProtocolProfileRegistry,
  getProtocolProfile,
  protocolProfileNames
} from './registry.js'
import { assertProfileNameIsNotVendorNamed, parseProtocolProfile } from './schema.js'
import { exampleProfile } from './example-profile.test-fixture.js'

describe('the shipped registry', () => {
  test('every registered profile is total and passes its own name rules', () => {
    // Vacuous while the registry is empty, and deliberately kept: it is the
    // test that starts doing work the moment a profile is authored, and it is
    // the one that would catch a definition added by hand around the parser.
    for (const name of protocolProfileNames()) {
      const profile = PROTOCOL_PROFILES[name]
      expect(() => parseProtocolProfile(profile)).not.toThrow()
      expect(() => assertProfileNameIsNotVendorNamed(profile.name)).not.toThrow()
      expect(profile.name).toBe(name)
    }
  })

  test('the registry is frozen, so nothing can register a profile at runtime', () => {
    // A profile added after startup is a profile no deployment record accounts
    // for.
    expect(Object.isFrozen(PROTOCOL_PROFILES)).toBe(true)
  })
})

describe('buildProtocolProfileRegistry', () => {
  test('an invalid definition fails at build time, naming the profile', () => {
    const broken = exampleProfile()
    // @ts-expect-error removing a wire field is the thing under test
    delete broken.workflows.verify.oid4vp.delivery

    expect(() => buildProtocolProfileRegistry([broken])).toThrow(
      /"example-1.0-by-reference-redirect-uri".*does not state the wire field "workflows\.verify\.oid4vp\.delivery"/s
    )
  })

  test('a name defined twice is refused — a name identifies one definition', () => {
    expect(() =>
      buildProtocolProfileRegistry([exampleProfile(), exampleProfile()])
    ).toThrow(/defined twice/)
  })
})

describe('getProtocolProfile', () => {
  test('an unknown name throws and lists what is registered', () => {
    const registry = buildProtocolProfileRegistry([exampleProfile()])

    expect(() => getProtocolProfile('example-1.0-absent-redirect-uri', registry))
      .toThrow(/Registered profiles: example-1.0-by-reference-redirect-uri/)
  })

  test('an empty registry says so rather than reporting an empty list', () => {
    expect(() =>
      getProtocolProfile('example-1.0-absent-redirect-uri', {})
    ).toThrow(/Registered profiles: \(none\)/)
  })
})
