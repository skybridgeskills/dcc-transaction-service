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
    .optional()
})

export const vcApiExchangeCreateSchema = z.object(
  {
    variables: baseVariablesSchema,
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
