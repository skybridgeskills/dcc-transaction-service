import { z } from 'zod'

export const credentialDataSchema = z
  .object(
    {
      vc: z
        .union([z.string(), z.object({})])
        .optional()
        .transform((vcData, ctx) => {
          if (typeof vcData !== 'string') {
            // Sets template to be a string
            try {
              return JSON.stringify(vcData)
            } catch {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  'Invalid VC data - must be a string or valid JSON object'
              })
              return z.NEVER
            }
          }
          return vcData
        }),
      subjectData: z.any().optional(),
      retrievalId: z.string({
        message:
          "Incomplete exchange data - every submitted record must have it's own retrievalId."
      }),
      redirectUrl: z.string().optional(),
      metadata: z.any().optional()
    },
    { message: 'Invalid JSON: expected object' }
  )
  .refine((data) => [data.vc, data.subjectData].some((d) => d !== undefined), {
    message:
      'Incomplete exchange data - you must provide either a vc or subjectData'
  })

export const optionalFutureDate = (d: string | undefined) => {
  if (!d) {
    return true
  }
  try {
    const date = new Date(d)
    return date < new Date()
  } catch {
    return false
  }
}

export const exchangeBatchSchema = z
  .object(
    {
      exchangeHost: z.string({
        message: 'Incomplete exchange data - you must provide an exchangeHost'
      }),
      tenantName: z.string().optional(),
      batchId: z.string().optional(),
      workflowId: z.enum(['didAuth', 'claim']).optional(),
      data: z.array(credentialDataSchema),
      expires: z
        .string()
        .datetime()
        .refine(optionalFutureDate, {
          message:
            'Invalid expires date. Must be ISO 8601 format datetime in the future.'
        })
        .optional()
    },
    { message: 'Invalid JSON: expected object' }
  )
  .refine(
    (d) => d.data.some((dd) => dd.subjectData !== undefined) == !!d.batchId,
    {
      message:
        'Incomplete exchange data - if you provide subjectData, you must also provide a batchId'
    }
  )

/**
 * Per-exchange knobs that propagate to every `verifier-core` call made
 * for the exchange's lifetime. Set once at exchange creation and read
 * (with `false` defaults) at each verifier call site.
 *
 * - `verbose` — if true, verifier-core's per-call `verbose: true` is
 *   passed through, surfacing every check that ran (not just failures
 *   and explicit skips). Default `false`.
 * - `timing` — if true, verifier-core attaches `timing: TaskTiming`
 *   on every `CheckResult`, every `SuiteSummary`, and the result
 *   root. Default `false`.
 *
 * `.strict()` rejects unknown nested keys at parse time, so a typo
 * like `{ options: { verbos: true } }` fails validation rather than
 * silently doing nothing.
 */
export const verifierOptionsSchema = z
  .object({
    verbose: z.boolean().optional(),
    timing: z.boolean().optional()
  })
  .strict()
  .optional()

// register all possible variables here
export const baseVariablesSchema = z.object({
  exchangeHost: z
    .string()
    .optional()
    .default(process.env.DEFAULT_EXCHANGE_HOST ?? 'http://localhost:4004'),
  tenantName: z.string().optional(),
  batchId: z.string().optional(),
  retrievalId: z.string().optional(),
  metadata: z.any().optional(),

  /**
   * When true, the workflow attaches compatibility-fix log entries (and
   * any other debug-only diagnostics) to `variables.results`. Falls back
   * to `Config.defaultExchangeDebug` (env `EXCHANGE_DEBUG_DEFAULT`).
   */
  debug: z.boolean().optional(),

  /**
   * Verifier-call knobs (`verbose`, `timing`); see
   * {@link verifierOptionsSchema}. Resolved once per call site with
   * `false` defaults — both the synchronous verify pass and the
   * asynchronous Open Badges worker pass read from this same object so
   * the entire exchange uses identical flags.
   */
  options: verifierOptionsSchema,

  // claim
  vc: z.string().optional(),

  // verify
  vprContext: z.array(z.string()).optional(),
  vprCredentialType: z.array(z.string()).optional(),
  trustedIssuers: z.array(z.string()).optional(),
  trustedRegistries: z.array(z.string()).optional(),
  vprClaims: z
    .array(
      z.object({
        path: z.array(z.string()),
        values: z.array(z.string())
      })
    )
    .optional(),
  /**
   * @deprecated Superseded by the protocol profile field
   * `workflows.verify.oid4vp.queryLanguage`. Still read, still works, and a
   * caller setting it emits exactly the bytes it always did.
   *
   * ⚠️ **A knob set here BEATS the active profile**, and that is deliberate:
   * exchanges in flight were created with these fields, and a profile that
   * outranked them would silently change what an in-flight exchange emits.
   * Setting this *and* `protocolProfileName` on the same request is refused —
   * see `exchangeCreateSchemaVerify`.
   *
   * ⚠️ Two-valued where the profile field is three-valued: a caller choosing a
   * query language is choosing one. The both-at-once accommodation is a
   * profile, not a knob.
   */
  oid4vpQueryLanguage: z.enum(['dcql', 'pex']).optional(),
  /**
   * @deprecated Superseded by the protocol profile field
   * `workflows.verify.oid4vp.delivery`. Still read, still works.
   *
   * ⚠️ Beats the active profile, deliberately — see `oid4vpQueryLanguage`.
   */
  oid4vpDelivery: z.enum(['by-reference', 'by-value']).optional(),
  /**
   * DIF PE `constraints.limit_disclosure` for the PEX verify arm.
   *
   * @deprecated Superseded by the protocol profile field
   * `workflows.verify.oid4vp.limitDisclosure`, which states `'none'` where this
   * field says nothing. Still read, still works.
   *
   * ⚠️ Beats the active profile, deliberately — see `oid4vpQueryLanguage`.
   */
  vprLimitDisclosure: z.enum(['required', 'preferred']).optional(),
  /**
   * Deliberately corrupt the issued credential AFTER signing, so a wallet's
   * rejection behaviour can be probed with a credential that is genuinely
   * invalid rather than merely malformed.
   *
   * `proof`  — corrupt `proof.proofValue`; the signature bytes no longer verify.
   * `claim`  — corrupt a claim the signature covers; the proof is untouched but
   *            no longer matches the payload.
   * `issuer` — restore the issuer id the PROFILE declared, overwriting the one
   *            the signing service set. The result names issuer Y and carries a
   *            proof by X.
   *
   * These are three different tests: a wallet that only checks a proof is
   * present and well-formed passes the first and fails the second, and a wallet
   * that verifies a proof without asking whose key it should have been signed
   * by passes both and fails the third. A service-side control, only ever
   * applied to our own issued credentials.
   */
  tamper: z.enum(['proof', 'claim', 'issuer']).optional(),

  /**
   * ACCOMMODATION — `token-endpoint-inline`, VARIANT, **default off**.
   *
   * Publish `token_endpoint` inline in the Credential Issuer Metadata document,
   * in addition to `authorization_servers`, for a client that reads only the
   * issuer metadata and never performs RFC 8414 authorization-server discovery.
   *
   * ⛔ **This is opt-in per exchange and MUST NOT become the default.** The
   * reason is written at `hono.ts`'s `oid4vciTokenByConvention` and it is the
   * whole design: advertising `token_endpoint` inline on every exchange
   * **would make every wallet look conformant and erase the measurement for
   * every vendor at once.** `token-endpoint-by-convention` keeps its
   * discriminator because CONSTRUCTING a URL is an aberrant act that still
   * leaves no `discovery-served doc:as` line. Reading an inline
   * `token_endpoint` is CORRECT behaviour, so once it is served by default the
   * absent `as` line no longer separates *"does not implement RFC 8414"* from
   * *"used the inline endpoint properly."*
   *
   * Hence: variant, not elective — the two constructions cannot both be live
   * and still be discriminating, so serving this one costs a separate arm. See
   * the elective/variant distinction in `docs/accommodations.md`.
   *
   * The condition it serves: some clients read only the issuer metadata and
   * never perform RFC 8414 discovery. That shape works against an issuer that
   * publishes `token_endpoint` INLINE and carries no `authorization_servers`
   * at all, and stalls before the token request against one that does not.
   */
  oid4vciTokenEndpointInline: z.boolean().optional(),

  /**
   * Name of the protocol profile this exchange asks to be served under — the
   * most specific of the three resolution layers (exchange → tenant →
   * app default). See `protocol-profiles/resolve.ts`.
   *
   * A NAME, never a definition. A caller that could post a definition could
   * make this service emit bytes that no name accounts for, which is precisely
   * what named profiles exist to prevent; definitions are this service's own
   * versioned data.
   *
   * Optional here because a caller naming nothing falls through to the tenant
   * and app-default layers — NOT because the profile itself has optional
   * parts. A profile is total; which profile you get is the layered question.
   */
  protocolProfileName: z.string().min(1).optional()
})

/**
 * The per-exchange knobs a protocol profile supersedes.
 *
 * ⚠️ **Deprecated, not removed.** Recorded runs cite them and a re-run months
 * from now must not silently change meaning. They still work, they still
 * beat the active profile, and each one's JSDoc names the profile field that
 * replaces it.
 *
 * Listed once, here, so the conflict check below and the documentation cannot
 * drift from the schema.
 *
 * ⚠️ **`vprAdvertiseCryptosuites` is not on this list, is not deprecated, and
 * must not be added.** It could only ever union suite names this verifier does
 * not accept into what it advertises accepting, which is a false statement made
 * on the wire; there is no narrower form of it worth keeping — see
 * `docs/adr/2026-09-10-advertised-acceptance-equals-actual.md`. `variables`
 * strips unknown keys, so a caller still sending it is served the honest
 * advertisement rather than an error. That is the intended outcome: the bytes
 * such a caller receives are the default construction's, byte for byte.
 */
export const PROFILE_SUPERSEDED_VARIABLES = [
  'oid4vpQueryLanguage',
  'oid4vpDelivery',
  'vprLimitDisclosure'
] as const

/**
 * Refuse a request that names a protocol profile **and** sets a knob the
 * profile supersedes.
 *
 * ⚠️ **This is not the same question as which layer wins.** A knob on the
 * exchange beating a profile from the tenant or the app default is two layers
 * disagreeing, and the more specific one wins — that is the resolution rule
 * working. A knob and a profile name on the SAME request are one caller saying
 * two things about the same wire field in one breath, and there is no
 * more-specific layer to break the tie. Serving either one silently would make
 * the name a lie about the bytes, which is the whole failure the profile
 * surface exists to end.
 */
export const profileKnobConflicts = (
  variables: Record<string, unknown> | undefined
): string[] =>
  variables?.protocolProfileName
    ? PROFILE_SUPERSEDED_VARIABLES.filter((k) => variables[k] !== undefined)
    : []

export const EXCHANGE_ID_PREFIX_PATTERN = /^[A-Za-z0-9_-]{1,32}$/

export const vcApiExchangeCreateSchema = z.object(
  {
    variables: baseVariablesSchema,
    /**
     * Caller-supplied component of the minted `exchangeId`. Lets a caller
     * correlate an exchange with a concept of its own — a test run, a batch,
     * a ticket — on every channel the id appears on, without this service
     * learning what that concept is.
     *
     * A sibling of `variables`, not a member of it: this is not an exchange
     * variable interpolated into a credential template, it is an instruction
     * to the id minter, read once at creation.
     *
     * Validated because the value lands in 16 route paths and a Keyv key. The
     * character class is what is safe in a URL path segment without escaping,
     * so a prefixed id can be pasted into a URL, a log grep and a filename
     * unchanged; the length bound keeps the id readable at a glance in a
     * traffic capture, which is most of the point of having one.
     */
    exchangeIdPrefix: z
      .string()
      .regex(EXCHANGE_ID_PREFIX_PATTERN, {
        message: 'exchangeIdPrefix must be 1-32 characters of [A-Za-z0-9_-].'
      })
      .optional(),
    expires: z.string().datetime().optional().refine(optionalFutureDate, {
      message:
        'Invalid expires date. Must be ISO 8601 format datetime in the future.'
    })
  },
  { message: 'Invalid JSON: expected object' }
)

export const workflowIdSchema = z.enum(['didAuth', 'claim'], {
  message: 'Invalid workflowId. Must be either didAuth or claim.'
})
