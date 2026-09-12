/**
 * Tests for the property the whole protocol profile surface rests on:
 * ⚠️ **a profile states every field that changes the bytes a wallet receives,
 * and a profile that does not is refused loudly, by name.**
 *
 * Each test below is named for the invariant it protects rather than for the
 * function it calls, because the function is replaceable and the invariant is
 * not. If one of these ever has to be relaxed, the surface has stopped being
 * worth having.
 */
import { describe, expect, test } from 'vitest'
import { z } from 'zod'
import {
  PROTOCOL_PROFILE_NAME_PATTERN,
  assertProfileNameIsNotVendorNamed,
  assertSchemaIsTotal,
  missingWireFields,
  parseProtocolProfile,
  protocolProfileSchema,
  workflowsSchema
} from './schema.js'
import { exampleProfile } from './example-profile.test-fixture.js'

/** Structured clone so a mutation in one test cannot reach another. */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

describe('totality — a missing wire field is refused, and the field is named', () => {
  test('the fixture is total, so a failure below is the mutation and not the fixture', () => {
    expect(() => parseProtocolProfile(exampleProfile())).not.toThrow()
    expect(missingWireFields(workflowsSchema, exampleProfile().workflows)).toEqual(
      []
    )
  })

  test('a deleted field fails validation, named, and told there is no fallback', () => {
    // ⚠️ The message is the assertion, not just the refusal. Zod refuses an
    // incomplete profile on its own; what an author needs to read is WHICH
    // field and that nothing is going to fill it in. Asserting only that a
    // throw happened would pass against a schema with the refinement torn out.
    const profile = clone(exampleProfile())
    // @ts-expect-error deleting a required field is the thing under test
    delete profile.workflows.verify.oid4vp.responseMode

    expect(() => parseProtocolProfile(profile)).toThrow(
      /does not state the wire field "workflows\.verify\.oid4vp\.responseMode".*no fallback for this one/s
    )
  })

  test('an explicit `undefined` is not a stated value either', () => {
    // The distinction matters: an author who writes `limitDisclosure:
    // undefined` has expressed an intention to leave it out, and leaving a
    // wire field out is exactly what a profile may not do. `'none'` is how
    // "not emitted" is said.
    const profile = exampleProfile()
    profile.workflows.verify.oid4vp!.limitDisclosure =
      undefined as unknown as 'none'

    expect(() => parseProtocolProfile(profile)).toThrow(
      /does not state the wire field "workflows\.verify\.oid4vp\.limitDisclosure"/
    )
  })

  test('every unstated field is reported at once, not one per parse', () => {
    // An author fixing a profile one crash at a time is an author who gives up
    // and reaches for a default.
    const profile = clone(exampleProfile())
    // @ts-expect-error deleting required fields is the thing under test
    delete profile.workflows.verify.oid4vp.delivery
    // @ts-expect-error deleting required fields is the thing under test
    delete profile.workflows.claim.oid4vci.grants

    const message = (() => {
      try {
        parseProtocolProfile(profile)
        return ''
      } catch (e) {
        return (e as Error).message
      }
    })()

    expect(message).toMatch(
      /does not state the wire field "workflows\.verify\.oid4vp\.delivery"/
    )
    expect(message).toMatch(
      /does not state the wire field "workflows\.claim\.oid4vci\.grants"/
    )
  })

  test('a `null` section is a stated absence and not a missing field', () => {
    // "This workflow offers no OID4VP construction" is an answer. The walk
    // stops there rather than demanding the fields underneath it.
    //
    // ⚠️ The envelope key goes with it. A stated absence has to be stated
    // consistently: a key reserved for a construction the branch does not offer
    // is a key with nothing to put in it, and `coherence.ts` says so.
    const profile = clone(exampleProfile())
    profile.workflows.verify.oid4vp = null
    profile.workflows.verify.envelope.oid4vpKeys = []

    expect(() => parseProtocolProfile(profile)).not.toThrow()
    expect(missingWireFields(workflowsSchema, profile.workflows)).toEqual([])
  })

  test('a section that is absent entirely is NOT the same as one stated null', () => {
    const profile = clone(exampleProfile())
    // @ts-expect-error deleting a required section is the thing under test
    delete profile.workflows.didAuth.oid4vp

    expect(() => parseProtocolProfile(profile)).toThrow(
      /does not state the wire field "workflows\.didAuth\.oid4vp"/
    )
  })

  test('a whole workflow may not be left out', () => {
    const profile = clone(exampleProfile())
    // @ts-expect-error deleting a required workflow is the thing under test
    delete profile.workflows.didAuth

    expect(() => parseProtocolProfile(profile)).toThrow(
      /does not state the wire field "workflows\.didAuth"/
    )
  })
})

describe('totality — the schema itself may not acquire a fallback', () => {
  test('no field in the shipped profile schema is optional or defaulted', () => {
    // The guarantee, not a sample of it: the walk covers every field there is,
    // so a field added later is covered without anyone updating this test.
    expect(() => assertSchemaIsTotal(protocolProfileSchema)).not.toThrow()
  })

  test('an optional field is rejected by the walk, so the test above can fail', () => {
    const withOptional = z.object({
      workflows: z.object({ verify: z.object({ delivery: z.string().optional() }) })
    })

    expect(() => assertSchemaIsTotal(withOptional)).toThrow(
      /workflows\.verify\.delivery.*optional/s
    )
  })

  test('a default is rejected too — it is a silent fill-in wearing a nicer face', () => {
    const withDefault = z.object({
      workflows: z.object({
        verify: z.object({ delivery: z.string().default('by-reference') })
      })
    })

    expect(() => assertSchemaIsTotal(withDefault)).toThrow(
      /workflows\.verify\.delivery.*default/s
    )
  })

  test('a nullable field is allowed — `null` is something an author wrote', () => {
    const withNullable = z.object({
      workflows: z.object({ verify: z.object({ oid4vp: z.string().nullable() }) })
    })

    expect(() => assertSchemaIsTotal(withNullable)).not.toThrow()
  })
})

describe('room for an arm is not a pretence of one', () => {
  test('an issuance media type with no arm behind it is refused, by name', () => {
    const profile = clone(exampleProfile())
    profile.workflows.claim.issuance!.mediaType = 'application/vc+sd-jwt'

    expect(() => parseProtocolProfile(profile)).toThrow(
      /No issuance arm is built for "application\/vc\+sd-jwt"/
    )
  })

  test('an envelope with no arm behind it is refused too', () => {
    const profile = clone(exampleProfile())
    profile.workflows.claim.issuance!.envelope =
      'enveloped-verifiable-credential'

    expect(() => parseProtocolProfile(profile)).toThrow(
      /No issuance arm is built for the "enveloped-verifiable-credential" envelope/
    )
  })

  test('a credential offer advertising no grants is refused', () => {
    const profile = clone(exampleProfile())
    profile.workflows.claim.oid4vci!.grants = []

    expect(() => parseProtocolProfile(profile)).toThrow(/at least one/)
  })
})

describe('names are flat, and never a vendor', () => {
  test.each([
    'oid4vp-1.0-json-by-reference-dcql-redirect-uri',
    'oid4vp-1.0-by-value-dcql-redirect-uri',
    'oid4vp-1.0-jwt-signed-by-reference-decentralized-identifier',
    'oid4vci-1.0-pre-authorized-code'
  ])('`%s` is a well-formed name', (name) => {
    expect(PROTOCOL_PROFILE_NAME_PATTERN.test(name)).toBe(true)
  })

  test.each([
    // A separator invites a hierarchy, and a hierarchy is inheritance with
    // better manners. Version belongs IN the name, not above it.
    ['oid4vp/1.0/by-value', 'a path separator'],
    ['oid4vp-1.0+dcql', 'a compositional plus'],
    ['OID4VP-1.0-by-value', 'uppercase'],
    ['oid4vp', 'a single segment carrying no version or prefix'],
    ['oid4vp-1.0-by value', 'a space']
  ])('`%s` is refused — %s', (name) => {
    expect(PROTOCOL_PROFILE_NAME_PATTERN.test(name)).toBe(false)
  })

  test.each([
    'oid4vp-1.0-asu-pocket-by-value',
    'lcw-1.0-vcapi',
    'oid4vp-1.0-learner-credential-wallet-redirect-uri',
    'learncard-1.0-vcapi'
  ])('`%s` is refused because it names a wallet product', (name) => {
    // A construction-named profile stays true. A vendor-named one becomes a
    // lie on that vendor's next release — and hides the overlap between
    // wallets that sharing a construction is the whole point of finding.
    expect(() => assertProfileNameIsNotVendorNamed(name)).toThrow(
      /named for their construction, never for a vendor/
    )
  })

  test('a vendor token inside a segment is not a false positive', () => {
    // Segment-bounded, not substring: refusing every name that happens to
    // contain three vendor letters would make the rule unusable and therefore
    // ignored.
    expect(() =>
      assertProfileNameIsNotVendorNamed('oid4vp-1.0-lcwx-by-value')
    ).not.toThrow()
  })

  test('a vendor-named profile is refused by the parser, not only the helper', () => {
    expect(() =>
      parseProtocolProfile(
        exampleProfile({ name: 'oid4vp-1.0-learncard-by-reference' })
      )
    ).toThrow(/never for a vendor/)
  })
})
