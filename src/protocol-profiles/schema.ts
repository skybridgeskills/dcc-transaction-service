/**
 * The Zod schema for a {@link ProtocolProfile}, and the TOTALITY check that
 * turns "a profile states every wire field" from a convention into a guarantee.
 *
 * ## Why the totality check is the load-bearing part
 *
 * Without a check that actually runs, totality is a rule in a document, and a
 * rule in a document is exactly how two deployments of this service come to
 * emit different bytes while both claiming to run the same named profile. The
 * check is what makes the name mean something.
 *
 * ## What actually enforces it, and what merely explains it
 *
 * ⚠️ **{@link assertSchemaIsTotal} is the guarantee. Be clear about that.** It
 * walks this schema at module load and throws if it finds a `.optional()` or a
 * `.default()` anywhere in it. It runs at **import, not in a test**, because a
 * rule that only a test enforces is a rule that ships broken the first time
 * somebody skips the tests. A `.default()` is the same failure wearing a
 * friendlier face — it fills a missing field silently, which is the precise
 * behaviour totality exists to forbid.
 *
 * Given that, Zod's own required-field checking already refuses an incomplete
 * profile. {@link missingWireFields} does **not** add a refusal on top of it,
 * and this file would be lying if it implied otherwise. What it adds is:
 *
 * - **A message written for an author, not for a parser.** "Required" tells
 *   somebody adding a wire field nothing about why there is no fallback. The
 *   refinement names the profile, names the dotted path, and says out loud
 *   that no default is coming.
 * - **A checker usable away from parsing.** A caller holding an already-typed
 *   profile can ask whether it states everything without re-parsing it.
 *
 * **Absence must still be stated.** A construction a workflow does not emit is
 * `null`, not missing; `null` short-circuits the walk for that subtree, because
 * the author has spoken.
 *
 * ⚠️ **The field list is DERIVED from the schema, never written twice.** There
 * is no array of field names anywhere in this file. Adding a field to
 * `types.ts` and this schema adds it to the totality check automatically; a
 * second, hand-maintained list would drift, and this repo's founding lesson is
 * that a wire-affecting value stated in two places is stated in neither.
 *
 * @see types.ts — what each field means and why it is a field at all
 */
import { z } from 'zod'
import { wallets } from '../lib/wallets/index.js'
import { WALLET_LINK_CONSTRUCTIONS } from '../lib/wallets/link-constructions.js'
import { coherenceProblems } from './coherence.js'
import {
  ISSUANCE_ENVELOPES,
  ISSUANCE_MEDIA_TYPES,
  OID4VCI_GRANTS,
  OID4VCI_OFFER_DELIVERIES,
  OID4VP_CLIENT_ID_PREFIXES,
  OID4VP_EXPECTED_ORIGINS_FORMS,
  OID4VP_REQUIRE_SIGNED_REQUEST_OBJECT,
  OID4VP_DELIVERIES,
  OID4VP_LIMIT_DISCLOSURES,
  OID4VP_QUERY_LANGUAGES,
  OID4VP_REQUEST_OBJECT_FORMATS,
  OID4VP_REQUEST_URI_METHODS,
  OID4VP_RESPONSE_MODES,
  VPR_ACCEPTED_METHODS_FORMS,
  VPR_DOMAIN_FORMS,
  VPR_INTERACT_SERVICE_TYPES,
  PROFILED_WORKFLOW_IDS,
  type ProfiledWorkflowId,
  type ProtocolProfile,
  type WorkflowWireProfile
} from './types.js'

// --- Naming -----------------------------------------------------------------

/**
 * Flat, lowercase, hyphen-separated segments; digits and dots allowed inside a
 * segment so a version rides in the name (`oid4vp-1.0-…`).
 *
 * ⚠️ No `/`, no `+`, no `:` — a separator invites a hierarchy, and a hierarchy
 * is inheritance with better manners.
 */
export const PROTOCOL_PROFILE_NAME_PATTERN = /^[a-z0-9][a-z0-9.]*(-[a-z0-9.]+)+$/

/**
 * Wallet product names a profile name may not contain.
 *
 * Every entry is **derived** from the wallet registry rather than retyped, so
 * a wallet added there is covered here without anyone remembering to. ⚠️ **No
 * product is hardcoded, deliberately.** A hand-maintained roster of products
 * goes stale the first time one is renamed or acquired, and a stale guard is
 * worse than no guard because it reads as complete. The registry is the one
 * place that knows which products exist.
 *
 * ⚠️ **Why a profile may not be vendor-named at all.** A construction-named
 * profile stays true; a vendor-named one becomes a lie on that vendor's next
 * release, and releases are frequent. Vendor names also hide the thing being
 * solved for:
 * several wallets share one construction, and that overlap IS the product
 * goal. And a profile named for a vendor is a standing claim about that
 * vendor, shipped in code they do not control.
 *
 * ⚠️ **This constrains NAMES, not the wire.** `lcw` is a legacy protocol key
 * that stays in the envelope — see `EnvelopeProfileFields.walletConvenienceKeys`.
 * Product-to-profile mapping is a separate lookup table, deliberately: it is
 * the part that *should* go stale, cheap to fix and obviously wrong when wrong.
 */
export const VENDOR_PRODUCT_NAME_TOKENS: string[] = wallets.flatMap((w) => [
  w.id.toLowerCase(),
  w.name.toLowerCase().replace(/\s+/g, '-')
])

/**
 * Throw if a profile name contains a wallet product name as a whole segment
 * (or run of segments).
 *
 * Segment-bounded rather than a bare substring match: a product token counts
 * only as a whole segment or run of segments, so `lcw-1.0-vcapi` is refused
 * while `oid4vp-1.0-lcwx-by-value` is not. A rule that refused every name
 * merely containing a product's letters would be unusable, and an unusable
 * rule is an ignored one.
 */
export const assertProfileNameIsNotVendorNamed = (name: string): void => {
  const padded = `-${name}-`
  const hit = VENDOR_PRODUCT_NAME_TOKENS.find((t) => padded.includes(`-${t}-`))
  if (hit) {
    throw new Error(
      `Protocol profile name "${name}" contains the wallet product name "${hit}". Profiles are named for their construction, never for a vendor; map products to profiles in the product lookup table instead.`
    )
  }
}

// --- Field schemas ----------------------------------------------------------

/**
 * ⚠️ **Every field below is REQUIRED. Not one is `.optional()`, and not one
 * carries a `.default()`.** That is the whole point, it is enforced at import
 * by {@link assertSchemaIsTotal}, and "just this one field can be optional" is
 * the first step of the failure this surface was built to end.
 */
const vprProfileFieldsSchema = z.object({
  interactServices: z.array(z.enum(VPR_INTERACT_SERVICE_TYPES)),
  domainForm: z.enum(VPR_DOMAIN_FORMS),
  emitAcceptedCryptosuites: z.boolean(),
  emitDidAuthenticationAcceptedCryptosuites: z.boolean(),
  acceptedMethodsForm: z.enum(VPR_ACCEPTED_METHODS_FORMS),
  acceptedMethods: z.array(z.string().min(1))
})

const envelopeProfileFieldsSchema = z.object({
  interactionUrlKeys: z.array(z.string().min(1)),
  vcapiKeys: z.array(z.string().min(1)),
  walletConvenienceKeys: z.array(z.string().min(1)),
  oid4vpKeys: z.array(z.string().min(1)),
  oid4vciKeys: z.array(z.string().min(1)),
  emitVerifiablePresentationRequest: z.boolean(),
  walletConvenienceConstruction: z.enum(WALLET_LINK_CONSTRUCTIONS)
})

const oid4vpProfileFieldsSchema = z.object({
  version: z.string().min(1),
  deepLinkScheme: z.string().min(1),
  delivery: z.enum(OID4VP_DELIVERIES),
  queryLanguage: z.enum(OID4VP_QUERY_LANGUAGES),
  clientIdPrefix: z.enum(OID4VP_CLIENT_ID_PREFIXES),
  emitClientIdScheme: z.boolean(),
  requestObjectFormat: z.enum(OID4VP_REQUEST_OBJECT_FORMATS),
  requestUriMethod: z.enum(OID4VP_REQUEST_URI_METHODS),
  responseMode: z.enum(OID4VP_RESPONSE_MODES),
  emitResponseUri: z.boolean(),
  requireSignedRequestObject: z.enum(OID4VP_REQUIRE_SIGNED_REQUEST_OBJECT),
  limitDisclosure: z.enum(OID4VP_LIMIT_DISCLOSURES),
  expectedOrigins: z.enum(OID4VP_EXPECTED_ORIGINS_FORMS)
})

const oid4vciProfileFieldsSchema = z.object({
  version: z.string().min(1),
  deepLinkScheme: z.string().min(1),
  offerDelivery: z.enum(OID4VCI_OFFER_DELIVERIES),
  grants: z.array(z.enum(OID4VCI_GRANTS)).nonempty({
    message:
      'A credential offer advertising no grants is not a thing this service can emit; state at least one.'
  })
})

/**
 * ⚠️ Only `application/vc` with no envelope has an implemented arm — but the
 * refusal lives in `coherence.ts` with every other "no arm is built" pin, not
 * here. One home for that class of rule is the whole point of the pattern; a
 * second home is how the pattern erodes.
 */
const issuanceProfileFieldsSchema = z.object({
  mediaType: z.enum(ISSUANCE_MEDIA_TYPES),
  envelope: z.enum(ISSUANCE_ENVELOPES)
})

const workflowWireProfileSchema = z.object({
  envelope: envelopeProfileFieldsSchema,
  vpr: vprProfileFieldsSchema,
  oid4vp: oid4vpProfileFieldsSchema.nullable(),
  oid4vci: oid4vciProfileFieldsSchema.nullable(),
  issuance: issuanceProfileFieldsSchema.nullable()
})

/**
 * ⚠️ The keys are written out rather than generated from
 * {@link PROFILED_WORKFLOW_IDS} so that Zod can infer the shape — but the
 * `satisfies` clause ties the two together: adding a workflow id without
 * adding its branch here, or vice versa, fails the type check rather than
 * producing a profile that silently states nothing for that workflow.
 */
const workflowsSchema = z.object({
  claim: workflowWireProfileSchema,
  didAuth: workflowWireProfileSchema,
  verify: workflowWireProfileSchema
} satisfies Record<ProfiledWorkflowId, typeof workflowWireProfileSchema>)

// --- Totality ---------------------------------------------------------------

/**
 * Unwrap the wrappers that do not change which fields exist, so the walkers
 * below see the object underneath.
 */
type ZodDef = { typeName: string; innerType?: z.ZodTypeAny; schema?: z.ZodTypeAny }
const defOf = (schema: z.ZodTypeAny): ZodDef =>
  (schema as unknown as { _def: ZodDef })._def

const unwrapEffects = (schema: z.ZodTypeAny): z.ZodTypeAny => {
  const def = defOf(schema)
  return def.typeName === 'ZodEffects' && def.schema
    ? unwrapEffects(def.schema)
    : schema
}

/**
 * Throw if any field in `schema` is optional or carries a default.
 *
 * ⚠️ Called at module load below. A profile field that may be omitted is not a
 * profile field — it is a default in disguise, and a default is what makes two
 * deployments disagree while both citing the same name.
 *
 * `.nullable()` is deliberately allowed: `null` is a value an author wrote
 * down, which is the opposite of an omission.
 */
export const assertSchemaIsTotal = (
  schema: z.ZodTypeAny,
  path: string[] = []
): void => {
  const here = unwrapEffects(schema)
  const def = defOf(here)
  const where = path.length ? path.join('.') : '<root>'
  if (def.typeName === 'ZodOptional') {
    throw new Error(
      `Protocol profile field "${where}" is optional. Profile fields are total: a construction that is not emitted states so with a value (\`none\`, \`false\`, \`[]\`, or a \`null\` section), never by being absent.`
    )
  }
  if (def.typeName === 'ZodDefault') {
    throw new Error(
      `Protocol profile field "${where}" carries a default. A default fills a missing field silently, which is exactly what totality forbids; state the value in every profile instead.`
    )
  }
  if (def.typeName === 'ZodNullable' && def.innerType) {
    assertSchemaIsTotal(def.innerType, path)
    return
  }
  if (def.typeName === 'ZodObject') {
    const shape = (here as z.ZodObject<z.ZodRawShape>).shape
    for (const [key, child] of Object.entries(shape)) {
      assertSchemaIsTotal(child as z.ZodTypeAny, [...path, key])
    }
  }
}

/**
 * Walk a schema against a candidate value and return the dotted path of every
 * wire field the candidate does not state.
 *
 * ⚠️ Not the refusal mechanism — see the module docblock. Zod already refuses
 * an incomplete profile; this is what turns that refusal into a sentence an
 * author can act on, and what lets a caller ask the question without parsing.
 *
 * A `null` at a nullable section is a stated absence and stops the walk there —
 * the author said "this workflow emits no such construction", which is an
 * answer. A missing key, or an explicit `undefined`, is not an answer.
 */
export const missingWireFields = (
  schema: z.ZodTypeAny,
  value: unknown,
  path: string[] = []
): string[] => {
  const here = unwrapEffects(schema)
  const def = defOf(here)

  if (def.typeName === 'ZodNullable' && def.innerType) {
    if (value === null) return []
    if (value === undefined) return [path.join('.')]
    return missingWireFields(def.innerType, value, path)
  }

  if (value === undefined) {
    return [path.join('.')]
  }

  if (def.typeName === 'ZodObject') {
    if (typeof value !== 'object' || value === null) return []
    const shape = (here as z.ZodObject<z.ZodRawShape>).shape
    return Object.entries(shape).flatMap(([key, child]) =>
      missingWireFields(
        child as z.ZodTypeAny,
        (value as Record<string, unknown>)[key],
        [...path, key]
      )
    )
  }

  return []
}

// --- The profile schema -----------------------------------------------------

/**
 * Parse and fully validate a protocol profile definition.
 *
 * Refusals, all of them loud and all of them naming the cause:
 * - a name that is not flat lowercase-hyphenated,
 * - a name carrying a wallet product name,
 * - any unstated wire field, named by its dotted path,
 * - an issuance media type or envelope with no arm behind it.
 */
export const protocolProfileSchema = z
  .object({
    name: z.string().regex(PROTOCOL_PROFILE_NAME_PATTERN, {
      message:
        'A protocol profile name is flat lowercase segments joined by hyphens, carrying the protocol family, its version, and the client_id prefix — for example `oid4vp-1.0-json-by-reference-dcql-redirect-uri`.'
    }),
    description: z.string().min(1),
    workflows: workflowsSchema
  })
  .superRefine((value, ctx) => {
    // ⚠️ Only checks that survive the field-level parse belong here. A
    // `superRefine` on the outer object does not run at all when a nested
    // field is missing, so an unstated-field check written here would be dead
    // code that reads like a guarantee. Unstated fields are Zod's own refusal;
    // `parseProtocolProfile` is where that refusal is turned into a sentence
    // an author can act on.
    try {
      assertProfileNameIsNotVendorNamed(value.name)
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: (e as Error).message
      })
    }
    // Combination checks. Totality catches a field an author forgot; these
    // catch a field an author filled in with a value that cannot work — which
    // in an option-rich surface is most of the ways to be wrong. See
    // `coherence.ts` for why the two classes are kept apart.
    for (const workflowId of PROFILED_WORKFLOW_IDS) {
      for (const { path, problem } of coherenceProblems(
        workflowId,
        value.workflows[workflowId] as WorkflowWireProfile
      )) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['workflows', workflowId, ...path],
          message: problem
        })
      }
    }
  })

/**
 * Render one Zod issue as a sentence written for a profile author.
 *
 * ⚠️ **An unstated wire field is the case worth spending words on.** Zod calls
 * it `Required`, which is accurate and useless: somebody adding a wire field to
 * this schema is about to go looking for the default that will cover the
 * profiles they did not update, and the answer they need is that there isn't
 * one and there is not going to be one.
 */
const describeIssue = (name: string, issue: z.ZodIssue): string => {
  const path = issue.path.join('.') || '<root>'
  const unstated =
    issue.code === z.ZodIssueCode.invalid_type && issue.received === 'undefined'
  if (unstated) {
    return `  - Protocol profile "${name}" does not state the wire field "${path}". A profile is total over every field that changes the bytes a wallet receives; there is no fallback for this one. A construction this workflow does not emit states so with a value — \`none\`, \`false\`, \`[]\`, or a \`null\` section.`
  }
  return `  - ${path}: ${issue.message}`
}

/**
 * Parse a profile definition, throwing an `Error` whose message names the
 * profile and every problem with it — all of them at once, because an author
 * fixing a profile one crash at a time is an author who reaches for a default.
 *
 * Wraps `ZodError` because the caller is an author reading a startup crash, not
 * a route handler mapping to a status code.
 */
export const parseProtocolProfile = (definition: unknown): ProtocolProfile => {
  const result = protocolProfileSchema.safeParse(definition)
  if (result.success) {
    return result.data as ProtocolProfile
  }
  const rawName = (definition as { name?: unknown })?.name
  const name = typeof rawName === 'string' ? rawName : '<unnamed>'
  const problems = result.error.issues
    .map((i) => describeIssue(name, i))
    .join('\n')
  throw new Error(
    `Protocol profile "${name}" is not a valid profile:\n${problems}`
  )
}

/**
 * ⚠️ Runs at import. Better a crash nobody can miss than a schema that quietly
 * stopped being total.
 */
assertSchemaIsTotal(protocolProfileSchema)

export {
  envelopeProfileFieldsSchema,
  issuanceProfileFieldsSchema,
  oid4vciProfileFieldsSchema,
  oid4vpProfileFieldsSchema,
  vprProfileFieldsSchema,
  workflowWireProfileSchema,
  workflowsSchema
}
