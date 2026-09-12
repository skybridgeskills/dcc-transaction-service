import { describe, expect, test } from 'vitest'
import {
  buildPresentationDefinition,
  dottedPathFor,
  jsonPathFor,
  pathCandidatesFor,
  PEX_LDP_VC_PROOF_TYPES,
  VC_BASE_TYPE
} from './pex.js'
import { buildDcqlQuery } from './dcql.js'
import { OID4VP_CRYPTOSUITE_VALUES } from './schemas.js'

const claims = [
  { path: ['credentialSubject', 'achievement', 'name'], values: ['Wonder'] },
  { path: ['credentialSubject', 'achievement', 'id'] }
]

describe('OID4VP · path rendering', () => {
  test('renders both candidate forms, dotted first', () => {
    // PEX `path` is an ordered array of candidates. Dotted leads because
    // minimal holders (including our own reference holder) ship a
    // dotted-only resolver and would match nothing against bracket-only.
    expect(pathCandidatesFor(['a', 'b'])).toEqual(["$.a.b", "$['a']['b']"])
  })

  test('a segment containing a dot emits the bracket form only', () => {
    // A dotted rendering of `a.b` would silently address a different node,
    // and a wrong match is worse than no match.
    expect(pathCandidatesFor(['a.b'])).toEqual(["$['a.b']"])
    expect(jsonPathFor(['a.b'])).toBe("$['a.b']")
  })
})

describe('OID4VP · buildPresentationDefinition', () => {
  test('constrains the base VC type, mirroring DCQL meta.type_values', () => {
    const def = buildPresentationDefinition({ vprClaims: [] })
    const fields = def.input_descriptors[0]!.constraints.fields
    expect(fields).toHaveLength(1)
    expect(fields[0]!.path).toEqual(pathCandidatesFor(['type']))
    expect(fields[0]!.filter).toMatchObject({
      contains: { const: VC_BASE_TYPE }
    })
  })

  test('maps values onto an enum filter, and omits filter when absent', () => {
    const fields =
      buildPresentationDefinition({ vprClaims: claims }).input_descriptors[0]!
        .constraints.fields
    const withValues = fields.find((f) => f.path[0]!.endsWith('.name'))
    const withoutValues = fields.find((f) => f.path[0]!.endsWith('.id'))
    expect(withValues!.filter).toEqual({ type: 'string', enum: ['Wonder'] })
    expect(withoutValues!.filter).toBeUndefined()
  })

  test('the format constraint is independently suppressible', () => {
    // The conformance suite varies type and format separately, to catch a
    // wallet that honours one and ignores the other.
    const withFormat = buildPresentationDefinition({ vprClaims: claims })
    const withoutFormat = buildPresentationDefinition({
      vprClaims: claims,
      includeFormat: false
    })
    expect(withFormat.input_descriptors[0]!.format?.ldp_vc?.proof_type).toEqual([
      ...PEX_LDP_VC_PROOF_TYPES
    ])
    expect(withoutFormat.input_descriptors[0]!.format).toBeUndefined()
    expect(withoutFormat.format).toBeUndefined()
    // suppressing format must not disturb the claim constraints
    expect(withoutFormat.input_descriptors[0]!.constraints.fields).toEqual(
      withFormat.input_descriptors[0]!.constraints.fields
    )
  })

  test('format.ldp_vc.proof_type carries proof-type names in both format blocks', () => {
    // PEX `proof_type` is the credential's `proof.type`, never a cryptosuite.
    // The definition-level and descriptor-level blocks are emitted from the
    // same object; asserting both is what stops one of them being rebuilt
    // from the cryptosuite list again.
    const def = buildPresentationDefinition({ vprClaims: claims })
    for (const block of [def.format, def.input_descriptors[0]!.format]) {
      expect(block?.ldp_vc?.proof_type).toEqual([
        'DataIntegrityProof',
        'Ed25519Signature2020'
      ])
    }
  })

  test('no cryptosuite name appears in either format block', () => {
    // The regression this replaces: `eddsa-rdfc-2022` in `proof_type` asked
    // for a proof whose *type* is a cryptosuite name, which no credential has,
    // so a client honouring the filter matches nothing and declines, while
    // one that ignores the filter is unaffected.
    const def = buildPresentationDefinition({ vprClaims: claims })
    const emitted = [
      ...(def.format?.ldp_vc?.proof_type ?? []),
      ...(def.input_descriptors[0]!.format?.ldp_vc?.proof_type ?? [])
    ]
    for (const cryptosuite of OID4VP_CRYPTOSUITE_VALUES) {
      expect(emitted).not.toContain(cryptosuite)
    }
    expect(OID4VP_CRYPTOSUITE_VALUES.length).toBeGreaterThan(0)
  })

  test('emits constraints.limit_disclosure only when the flag is set', () => {
    // `limit_disclosure` is the DIF PE instruction that turns `fields` from a
    // matching constraint into a narrowing one. Absent by default so the
    // emitted definition is unchanged; 'required' when the flag is set.
    const withoutFlag = buildPresentationDefinition({ vprClaims: claims })
    expect(
      withoutFlag.input_descriptors[0]!.constraints.limit_disclosure
    ).toBeUndefined()

    const withFlag = buildPresentationDefinition({
      vprClaims: claims,
      limitDisclosure: 'required'
    })
    expect(withFlag.input_descriptors[0]!.constraints.limit_disclosure).toBe(
      'required'
    )

    // Setting the flag disturbs nothing else — the fields are identical.
    expect(withFlag.input_descriptors[0]!.constraints.fields).toEqual(
      withoutFlag.input_descriptors[0]!.constraints.fields
    )
  })

  test('DCQL and PEX address the same claim nodes for the same vprClaims', () => {
    // The two languages must express ONE request. If their claim mapping
    // diverges, comparing a wallet's behaviour across them is meaningless.
    const dcqlPaths = (
      buildDcqlQuery({ vprClaims: claims }).credentials[0].claims ?? []
    ).map((c) => c.path)
    const pexClaimFields = buildPresentationDefinition({
      vprClaims: claims
    }).input_descriptors[0]!.constraints.fields.filter(
      (f) => f.path[0] !== dottedPathFor(['type'])
    )
    expect(pexClaimFields.map((f) => f.path)).toEqual(
      dcqlPaths.map((segments) => pathCandidatesFor(segments))
    )
  })
})
