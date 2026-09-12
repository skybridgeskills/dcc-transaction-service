/**
 * Tests for the combination checks — the second way a profile can be wrong.
 *
 * Every case below **parsed cleanly before these rules existed**, and several
 * would have gone out on the wire saying one thing while the request said
 * another. That is the defect being closed: not a malformed profile, but a
 * well-formed profile that is not what the service will do.
 */
import { describe, expect, test } from 'vitest'
import {
  CONTRADICTIONS,
  UNBUILT_ARMS,
  coherenceProblems
} from './coherence.js'
import { parseProtocolProfile } from './schema.js'
import { exampleProfile } from './example-profile.test-fixture.js'
import { PROTOCOL_PROFILES, protocolProfileNames } from './registry.js'
import type { ProtocolProfile } from './types.js'

/** Apply a mutation to the fixture's verify branch and parse it. */
const parseWithVerify = (
  mutate: (profile: ProtocolProfile) => void
): (() => unknown) => {
  const profile = exampleProfile()
  // The fixture's verify branch states no OID4VP arm by default in some tests;
  // give every case one to mutate.
  profile.workflows.verify.oid4vp = {
    version: '1.0',
    deepLinkScheme: 'openid4vp',
    delivery: 'by-reference',
    queryLanguage: 'dcql',
    clientIdPrefix: 'redirect-uri',
    emitClientIdScheme: false,
    requestObjectFormat: 'json',
    requestUriMethod: 'none',
    responseMode: 'direct_post',
    emitResponseUri: true,
    requireSignedRequestObject: 'omitted',
    limitDisclosure: 'none',
    expectedOrigins: 'omitted'
  }
  profile.workflows.verify.envelope.oid4vpKeys = ['OID4VP']
  mutate(profile)
  return () => parseProtocolProfile(profile)
}

describe('contradictions — wrong no matter what anybody builds', () => {
  test('a `redirect_uri` client_id may not carry a signed request object', () => {
    // OID4VP §5.9.3 forbids it outright: the wallet has no way to obtain a key
    // to verify such a request with. Reported even though the signed arm is
    // also unbuilt, because this one stays true after it is built.
    expect(
      parseWithVerify((p) => {
        p.workflows.verify.oid4vp!.requireSignedRequestObject = 'declared-true'
      })
    ).toThrow(/cannot carry a signed request object/)
  })

  test('a `decentralized_identifier` client_id with an unsigned request is decoration', () => {
    expect(
      parseWithVerify((p) => {
        p.workflows.verify.oid4vp!.clientIdPrefix = 'decentralized-identifier'
      })
    ).toThrow(/nothing to verify, and the prefix becomes decoration/)
  })

  test('`request_uri_method` on the by-value arm describes a fetch that cannot happen', () => {
    expect(
      parseWithVerify((p) => {
        p.workflows.verify.oid4vp!.delivery = 'by-value'
        p.workflows.verify.oid4vp!.requestUriMethod = 'get'
      })
    ).toThrow(/no `request_uri`, so this describes how a wallet should perform a fetch that cannot happen/)
  })

  test('⚠️ `limit_disclosure` with DCQL is the one that silently emitted nothing', () => {
    // The reason this class of check exists. DCQL has no `limit_disclosure`,
    // so the ask was dropped and the request went out asking for everything —
    // and a run on that profile would have reported a wallet's behaviour
    // under an ask it never received.
    expect(
      parseWithVerify((p) => {
        p.workflows.verify.oid4vp!.limitDisclosure = 'required'
      })
    ).toThrow(/DCQL has no equivalent field/)
  })

  test('an OID4VP construction may not sit on a claim or didAuth branch', () => {
    const profile = exampleProfile()
    profile.workflows.claim.oid4vp = {
      ...exampleProfile().workflows.verify.oid4vp!,
      version: '1.0',
      deepLinkScheme: 'openid4vp',
      delivery: 'by-reference',
      queryLanguage: 'dcql',
      clientIdPrefix: 'redirect-uri',
      emitClientIdScheme: false,
      requestObjectFormat: 'json',
      requestUriMethod: 'none',
      responseMode: 'direct_post',
      emitResponseUri: true,
      requireSignedRequestObject: 'omitted',
      limitDisclosure: 'none',
      expectedOrigins: 'omitted'
    }
    expect(() => parseProtocolProfile(profile)).toThrow(
      /An OID4VP construction on the `claim` branch/
    )
  })

  test('an OID4VCI construction may not sit on a verify branch', () => {
    const profile = exampleProfile()
    profile.workflows.verify.oid4vci = {
      version: '1.0',
      deepLinkScheme: 'openid-credential-offer',
      offerDelivery: 'by-reference',
      grants: ['pre-authorized-code']
    }
    expect(() => parseProtocolProfile(profile)).toThrow(
      /An OID4VCI construction on the `verify` branch/
    )
  })

  test('the claim branch must state an issuance media type, and only it may', () => {
    const missing = exampleProfile()
    missing.workflows.claim.issuance = null
    expect(() => parseProtocolProfile(missing)).toThrow(
      /The `claim` branch states no issuance media type/
    )

    const spurious = exampleProfile()
    spurious.workflows.didAuth.issuance = {
      mediaType: 'application/vc',
      envelope: 'none'
    }
    expect(() => parseProtocolProfile(spurious)).toThrow(
      /issuance media type on the `didAuth` branch, which issues no credential/
    )
  })

  test('⚠️ `require_signed_request_object: true` beside an unsigned envelope is refused', () => {
    // ⚠️ NEWLY REACHABLE, and permanent. While `declared-true` was pinned as
    // unbuilt this combination could not be written at all. Building the signed
    // arm lifted the pin and made it writable — a verifier declaring it
    // requires signed requests while serving an unsigned one at the very next
    // fetch.
    //
    // Asserted through `coherenceProblems` rather than the parse message
    // because on a `decentralized-identifier` prefix the
    // `decentralized-identifier-needs-a-signature` rule necessarily fires too:
    // the ONLY prefix that can carry `declared-true` is the DID one, and an
    // unsigned envelope under it is independently wrong. Naming the id is what
    // proves this rule fired and not merely its neighbour.
    const profile = exampleProfile()
    profile.workflows.verify.oid4vp = {
      version: '1.0',
      deepLinkScheme: 'openid4vp',
      delivery: 'by-reference',
      queryLanguage: 'dcql',
      clientIdPrefix: 'decentralized-identifier',
      emitClientIdScheme: false,
      requestObjectFormat: 'json',
      requestUriMethod: 'none',
      responseMode: 'direct_post',
      emitResponseUri: true,
      requireSignedRequestObject: 'declared-true',
      limitDisclosure: 'none',
      expectedOrigins: 'omitted'
    }
    profile.workflows.verify.envelope.oid4vpKeys = ['OID4VP']
    const ids = coherenceProblems(
      'verify',
      profile.workflows.verify
    ).map((problem) => problem.id)
    expect(ids).toContain('require-signed-contradicts-an-unsigned-envelope')
    expect(() => parseProtocolProfile(profile)).toThrow(
      /the very next fetch of `request_uri` would then hand it an unsigned one/
    )
  })

  test('the conformant combination itself is accepted — the pins really are gone', () => {
    // ⚠️ The other half of lifting a pin, and the half that is easy to forget:
    // a rule that refuses everything is indistinguishable from a rule that
    // refuses the wrong thing. This is the combination the conformant arm
    // serves, and it must parse.
    expect(
      parseWithVerify((p) => {
        p.workflows.verify.oid4vp!.clientIdPrefix = 'decentralized-identifier'
        p.workflows.verify.oid4vp!.requestObjectFormat = 'jwt-signed'
        p.workflows.verify.oid4vp!.requireSignedRequestObject = 'declared-true'
      })
    ).not.toThrow()
  })

  test('an envelope key with no construction behind it is refused', () => {
    const profile = exampleProfile()
    profile.workflows.didAuth.envelope.oid4vpKeys = ['OID4VP']
    expect(() => parseProtocolProfile(profile)).toThrow(
      /a key with nothing to put in it/
    )
  })

  test('a construction with no envelope key to land in is refused', () => {
    const profile = exampleProfile()
    profile.workflows.claim.envelope.oid4vciKeys = []
    expect(() => parseProtocolProfile(profile)).toThrow(
      /no envelope key to land in/
    )
  })
})

describe('unbuilt arms — coherent, buildable, not built', () => {
  test.each([
    ['responseMode', 'direct_post.jwt', /No arm is built for the "direct_post.jwt" response mode/],
    ['emitResponseUri', false, /No arm omits `response_uri`/],
    ['deepLinkScheme', 'haip', /No arm emits a "haip:\/\/" deep link/],
    ['version', '1.1', /No arm is built for OID4VP "1.1"/]
  ])('oid4vp.%s = %s is refused, naming what may be stated instead', (field, value, matcher) => {
    expect(
      parseWithVerify((p) => {
        ;(p.workflows.verify.oid4vp as unknown as Record<string, unknown>)[
          field as string
        ] = value
      })
    ).toThrow(matcher as RegExp)
  })

  // ⚠️ **`requestObjectFormat: 'jwt-signed'` and `requireSignedRequestObject:
  // 'declared-true'` used to be rows in this block, and they are gone.**
  //
  // Both were pins: coherent, buildable, not built. The conformant arm built
  // them, so the pins went in the same change that wired the fields — which is
  // the pattern working, not an assertion being weakened. What replaced them is
  // in the contradictions block above: the combinations that stay wrong after
  // the arm exists. Two assertions therefore changed here deliberately, and
  // this comment is the record of why rather than a silent deletion.

  test('a JWT request object passed by value is refused — it is the `request` parameter', () => {
    // ⚠️ This pairing became reachable when the first JWT arm lifted the format
    // pin, and it does not depend on which JWT format is in the enum:
    // `jwt-signed` by value is the same unbuilt construction. The DID prefix is
    // set too, so the only problem reported is the one this test is about.
    expect(
      parseWithVerify((p) => {
        p.workflows.verify.oid4vp!.delivery = 'by-value'
        p.workflows.verify.oid4vp!.clientIdPrefix = 'decentralized-identifier'
        p.workflows.verify.oid4vp!.requestObjectFormat = 'jwt-signed'
      })
    ).toThrow(/carrying a Request Object JWT inline is the `request` parameter/)
  })

  test('a grant with no token endpoint behind it is refused', () => {
    const profile = exampleProfile()
    profile.workflows.claim.oid4vci!.grants = [
      'pre-authorized-code',
      'authorization-code'
    ]
    expect(() => parseProtocolProfile(profile)).toThrow(
      /puts a wallet into a flow that dead-ends/
    )
  })

  test('an offer delivered by value is refused while no route emits one', () => {
    const profile = exampleProfile()
    profile.workflows.claim.oid4vci!.offerDelivery = 'by-value'
    expect(() => parseProtocolProfile(profile)).toThrow(
      /No arm offers the credential offer by value/
    )
  })

  test('⚠️ `interact` may not carry our own interaction URL — it means delegation', () => {
    // Read from the VCALM text, not inferred: the `interact` interaction
    // protocol is "used to redirect a wallet to a different interaction URL,
    // where the exchange will continue". Our interaction URL is the thing whose
    // GET returns this map, not an entry in it.
    const profile = exampleProfile()
    profile.workflows.verify.envelope.interactionUrlKeys = ['iu', 'interact']
    expect(() => parseProtocolProfile(profile)).toThrow(
      /redirect a wallet to a different interaction URL/
    )
  })

  test('a key may not be claimed by two constructions', () => {
    const profile = exampleProfile()
    profile.workflows.verify.envelope.vcapiKeys = ['vcapi', 'iu']
    expect(() => parseProtocolProfile(profile)).toThrow(
      /second write wins silently/
    )
  })

  test('only the verify builder can put acceptedCryptosuites on the DIDAuthentication query', () => {
    const profile = exampleProfile()
    profile.workflows.claim.vpr.emitDidAuthenticationAcceptedCryptosuites = true
    expect(() => parseProtocolProfile(profile)).toThrow(
      /has no arm for putting `acceptedCryptosuites` on it/
    )
  })

  test('⚠️ a `vcapi` key with no endpoint-bearing service is refused', () => {
    // The coupling made explicit: that key IS the first such service's
    // endpoint, so dropping the services while keeping the key would serve a
    // protocols object that offers VC-API and points at an empty string.
    const profile = exampleProfile()
    profile.workflows.verify.vpr.interactServices = []
    expect(() => parseProtocolProfile(profile)).toThrow(
      /offers VC-API and points nowhere/
    )
  })

  test('dropping the services together with the `vcapi` key is now authorable', () => {
    // ⚠️ This was refused until `getProtocols` read the key arrays — the two
    // rules together reported a real dependency between milestones, and wiring
    // the envelope discharged it. Keeping the key while dropping the services
    // is still refused, because that key IS the first service's endpoint.
    const profile = exampleProfile()
    profile.workflows.verify.vpr.interactServices = []
    profile.workflows.verify.envelope.vcapiKeys = []

    expect(() => parseProtocolProfile(profile)).not.toThrow()
  })
})

describe('the pattern itself', () => {
  test('every shipped profile is coherent, not merely total', () => {
    for (const name of protocolProfileNames()) {
      const profile = PROTOCOL_PROFILES[name]!
      for (const workflowId of ['claim', 'didAuth', 'verify'] as const) {
        expect(
          coherenceProblems(workflowId, profile.workflows[workflowId])
        ).toEqual([])
      }
    }
  })

  test('the two classes stay disjoint, and every rule has a distinct id', () => {
    // ⚠️ Guards against the tempting fix — moving a failing entry from the
    // unbuilt list to the contradiction list to make it stop being a work item.
    // They mean different things to a reader deciding what to build next.
    const contradictionIds = CONTRADICTIONS.map((r) => r.id)
    const unbuiltIds = UNBUILT_ARMS.map((r) => r.id)
    const all = [...contradictionIds, ...unbuiltIds]

    expect(new Set(all).size).toBe(all.length)
    expect(
      contradictionIds.filter((id) => unbuiltIds.includes(id))
    ).toEqual([])
  })

  test('contradictions are reported before unbuilt arms', () => {
    // An author wants the permanent problem before the temporary one.
    const wire = exampleProfile().workflows.verify
    wire.oid4vp = {
      version: '1.0',
      deepLinkScheme: 'openid4vp',
      delivery: 'by-value',
      queryLanguage: 'dcql',
      clientIdPrefix: 'redirect-uri',
      emitClientIdScheme: false,
      requestObjectFormat: 'json',
      requestUriMethod: 'get',
      responseMode: 'direct_post',
      emitResponseUri: true,
      requireSignedRequestObject: 'declared-true',
      limitDisclosure: 'none',
      expectedOrigins: 'omitted'
    }
    wire.envelope.oid4vpKeys = ['OID4VP']

    const problems = coherenceProblems('verify', wire)
    // Three contradictions, then one unbuilt arm. ⚠️ **This expectation moved
    // when the conformant arm landed, and the move is the pattern working.**
    // `declared-true` used to trip both classes at once — a contradiction and
    // the `require-signed-request-object` pin. The pin is gone (the arm is
    // built) and what took its place is a second CONTRADICTION: declaring the
    // requirement beside an unsigned envelope. So the same profile is still
    // refused, still for permanent reasons, and the ordering rule is still what
    // this test is about — contradictions before unbuilt arms, because an
    // author wants the permanent problem before the temporary one.
    expect(problems.map((p) => p.id)).toEqual([
      'redirect-uri-cannot-be-signed',
      'require-signed-contradicts-an-unsigned-envelope',
      'by-value-has-no-request-uri',
      'request-uri-method-get'
    ])
  })
})
