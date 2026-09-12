/**
 * Pure builder mapping a verify exchange's credential-type configuration
 * (`vprClaims`) onto a DIF Presentation Exchange `presentation_definition`,
 * the alternative to {@link buildDcqlQuery} in the authorization request.
 *
 * Spec: https://identity.foundation/presentation-exchange/spec/v2.0.0/
 *
 * Why both query languages exist: the reference holder in our interop test
 * suite speaks Presentation Exchange only, so a DCQL-only verifier cannot
 * self-test the OID4VP present leg at all. Serving both also makes it
 * possible to ask a wallet the same question twice and compare — which is
 * how a wallet that applies a `type` constraint but ignores a `format`
 * constraint gets caught.
 *
 * Mapping decisions, chosen to mirror `dcql.ts` so the two languages express
 * the SAME request:
 * - Exactly one input descriptor, `format: 'ldp_vc'`.
 * - The credential type is NOT narrowed to a specific type. DCQL pins the
 *   constant fully-expanded `VC_TYPE_IRI` in `meta.type_values` (§B.1.1);
 *   the PEX analogue is a constant field constraint asserting `type`
 *   contains `VerifiableCredential`. Type/claims enforcement stays
 *   post-verification in both languages.
 * - `constraints.fields` are derived 1:1 from `vprClaims`, from the same
 *   `path` segments `dcql.ts` consumes.
 * - The `format` block is independently suppressible — see `includeFormat`.
 */
import {
  presentationDefinitionSchema,
  type PresentationDefinition,
  type PexField
} from './schemas.js'

/** The `type` value every VCDM credential carries; the PEX analogue of DCQL's constant `meta.type_values`. */
export const VC_BASE_TYPE = 'VerifiableCredential'

/**
 * Proof types accepted in `format.ldp_vc.proof_type`.
 *
 * PEX `format.<fmt>.proof_type` takes **proof type** names — the value of the
 * credential's `proof.type` — and NOT cryptosuite names. The distinction is
 * real and this service already honours it elsewhere: the DCQL arm splits
 * `proof_type_values: ['DataIntegrityProof']` from
 * `cryptosuite_values: ['eddsa-rdfc-2022', …]` in `client_metadata`
 * (`authorization-request.ts`), and `OID4VP_CRYPTOSUITE_VALUES` in
 * `schemas.ts` is documented as the latter.
 *
 * This previously emitted the cryptosuite list, which asked for a proof whose
 * *type* was `eddsa-rdfc-2022` — a value no credential's `proof.type` ever
 * holds. A client that honours the format constraint therefore matches nothing
 * and declines, while one that ignores the constraint is unaffected and
 * presents — so the defect surfaced only against clients applying the
 * constraint as written, and was invisible against the rest.
 *
 * Both current proof types are listed. `DataIntegrityProof` covers the
 * `-rdfc-` suites this verifier advertises; `Ed25519Signature2020` is the
 * legacy proof type, which the verify pipeline still verifies on inbound
 * presentations and which real holders still carry.
 */
export const PEX_LDP_VC_PROOF_TYPES = [
  'DataIntegrityProof',
  'Ed25519Signature2020'
] as const

/** A segment safe to express in dotted notation — no `.`, quote or bracket. */
const isDotSafe = (segment: string): boolean => /^[^.[\]'"]+$/.test(segment)

/**
 * Render `App.DcqlClaim['path']` segments as bracket-notation JSONPath.
 *
 * Unambiguous for any segment, including one containing a `.`, where the
 * dotted form would not be.
 */
export const jsonPathFor = (segments: string[]): string =>
  `$${segments.map((s) => `['${s}']`).join('')}`

/** Render the same segments as dotted JSONPath. Only valid for dot-safe segments. */
export const dottedPathFor = (segments: string[]): string =>
  `$${segments.map((s) => `.${s}`).join('')}`

/**
 * Candidate JSONPaths for one set of segments, most-compatible first.
 *
 * PEX `path` is an ORDERED ARRAY of candidate JSONPaths, tried in turn —
 * so compatibility and precision are not a trade-off here, we emit both.
 *
 * Dotted comes first deliberately. Real holders commonly ship a minimal
 * dotted-only resolver — our own reference holder splits on `.` and would
 * match nothing against a bracket-only path, which would make it unable to
 * present and defeat the entire reason PEX exists in this service. The
 * bracket form follows for consumers that support it.
 *
 * A segment that is not dot-safe emits the bracket form ONLY: a dotted
 * rendering of `a.b` would silently address a different node, and a wrong
 * match is worse than no match.
 */
export const pathCandidatesFor = (segments: string[]): [string, ...string[]] =>
  segments.every(isDotSafe)
    ? [dottedPathFor(segments), jsonPathFor(segments)]
    : [jsonPathFor(segments)]

/** Map one verify-variable claim onto a PEX constraint field. */
const toPexField = (claim: App.DcqlClaim): PexField => ({
  ...(claim.id ? { id: claim.id } : {}),
  path: pathCandidatesFor(claim.path),
  ...(claim.values && claim.values.length > 0
    ? { filter: { type: 'string' as const, enum: claim.values } }
    : {})
})

/**
 * Build a spec-valid `presentation_definition` from a verify exchange's
 * `vprClaims`. Validated through {@link presentationDefinitionSchema} before
 * it is returned, so a malformed mapping fails at build time rather than on
 * the wire — same discipline as `buildDcqlQuery`.
 *
 * `includeFormat` exists so the `format` constraint can be varied
 * independently of the type and claim constraints. That is not a
 * convenience: a wallet that honours the type constraint while ignoring the
 * format constraint will offer its holder a credential the verifier's own
 * definition would reject, and the defect is invisible unless the two can be
 * varied separately.
 */
export const buildPresentationDefinition = ({
  vprClaims,
  definitionId = 'presentation',
  descriptorId = 'credential',
  includeFormat = true,
  limitDisclosure
}: {
  vprClaims: App.DcqlClaim[]
  definitionId?: string
  descriptorId?: string
  includeFormat?: boolean
  /**
   * DIF PE `constraints.limit_disclosure`. When set, emitted inside
   * `constraints` to instruct a conformant wallet to return ONLY the matched
   * `fields` rather than the whole credential. Default `undefined` omits the
   * member entirely, so the emitted definition is byte-identical to the prior
   * behaviour for any caller that does not set it.
   */
  limitDisclosure?: 'required' | 'preferred'
}): PresentationDefinition => {
  const format = { ldp_vc: { proof_type: [...PEX_LDP_VC_PROOF_TYPES] } }
  const typeField: PexField = {
    path: pathCandidatesFor(['type']),
    filter: { type: 'array' as const, contains: { const: VC_BASE_TYPE } }
  }
  const definition = {
    id: definitionId,
    input_descriptors: [
      {
        id: descriptorId,
        constraints: {
          fields: [typeField, ...vprClaims.map(toPexField)],
          ...(limitDisclosure ? { limit_disclosure: limitDisclosure } : {})
        },
        ...(includeFormat ? { format } : {})
      }
    ],
    ...(includeFormat ? { format } : {})
  }
  return presentationDefinitionSchema.parse(definition)
}
