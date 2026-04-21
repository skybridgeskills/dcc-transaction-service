import type {
  EntityIdentityRegistry,
  SuiteSummary as VerifierCoreSuiteSummary,
  TaskTiming as VerifierCoreTaskTiming
} from '@digitalcredentials/verifier-core'

declare global {
  namespace App {
    /** Issuer identity + cryptosuite + signing-service tenant for one issuance line. */
    interface IssuerInstance {
      id: string
      cryptosuite: string
      signingServiceTenant: string
    }

    interface Tenant {
      tenantName: string
      tenantToken: string
      origin?: string
      /** When set, signing uses these rows; otherwise legacy behavior uses exchange tenant name. */
      issuerInstances?: IssuerInstance[]
    }

    interface Config {
      port: number
      defaultExchangeHost: string
      exchangeTtl: number
      statusService: string
      signingService: string
      defaultWorkflow: string
      defaultTenantName: string
      /**
       * When true (default), the interaction UI may show an expandable details
       * section for verification and other workflows. Set `UI_SHOW_DETAILS=false` to hide.
       */
      uiShowDetails: boolean
      /** HS256 secret for OAuth access JWTs (client_credentials). Empty disables issuance. */
      accessJwtSecret: string
      keyvFilePath?: string
      redisUri?: string
      keyvWriteDelayMs: number
      keyvExpiredCheckDelayMs: number
      tenants: Record<string, Tenant>
      tenantAuthenticationEnabled: boolean
      defaultTrustedRegistryNames: string[]
      /**
       * Static DCC registries plus env-driven entries (`REGISTRY_OIDF_*`,
       * `REGISTRY_VC_RECOGNITION_*`).
       */
      knownRegistries: Record<string, EntityIdentityRegistry>
      /**
       * Default value for `BaseVariables.debug` when an exchange does not
       * specify it. Set env `EXCHANGE_DEBUG_DEFAULT=true` (or `1` / `yes`)
       * to enable globally.
       */
      defaultExchangeDebug: boolean
      /**
       * Per-attempt deadline (ms) for asynchronous Open Badges verification
       * tasks. A task whose `deadlineAt` has lapsed is eligible for retry on
       * the next GET-driven sweep. Override with `VERIFY_TASK_DEADLINE_MS`.
       */
      verifyTaskDeadlineMs: number
      /**
       * Maximum number of attempts (initial + retries) for an async verify
       * task before it is marked `gave-up` and the exchange transitions to
       * `'invalid'` with a synthetic timeout CheckResult. Override with
       * `VERIFY_TASK_MAX_ATTEMPTS`.
       */
      verifyTaskMaxAttempts: number
    }

    interface ErrorResponseBody {
      code: number
      message: string
      details?: Array<{
        code: string
        message: string
        path: Array<string>
      }>
    }

    interface Credential extends Record<string, unknown> {
      credentialSubject: Record<string, unknown> & {
        id: string
      }
    }

    interface ExchangeBatch {
      data: Array<{
        vc: string // JSON template string
        subjectData?: Record<string, unknown>
        retrievalId?: string // Optional for later retrieval/correlation of this record
        metadata?: Record<string, unknown> // Additional data to store related to the exchange
        redirectUrl?: string
      }>
      batchId?: string
      exchangeHost: string
      tenantName: string
      workflowId?: string
    }

    interface ExchangeCreateInput {
      expires?: string
      variables: Record<string, unknown> & {
        vc?: string
        redirectUrl?: string
        exchangeHost: string
        tenantName: string
        challenge?: string
      }
    }

    // TODO: verify with OID4VP
    interface DcqlQuery {
      path: string
      value: string
    }

    type SupportedWorkflowIds = 'didAuth' | 'claim' | 'verify' | 'healthz'
    type ExchangeState = 'pending' | 'active' | 'complete' | 'invalid'

    interface BaseVariables {
      redirectUrl?: string
      retrievalId?: string
      exchangeHost: string
      metadata?: Record<string, unknown>
      challenge: string // Used to authenticate presentations
      results?: Record<string, unknown>
      /**
       * UI and client feature flags (short keys, string or boolean values).
       * Example: `{ details: true }` toggles advanced verification details.
       */
      features?: Record<string, string | boolean>
      /**
       * When true, the workflow attaches compatibility-fix log entries (and
       * any other debug-only diagnostics) to `variables.results`. Defaults
       * to `Config.defaultExchangeDebug`.
       */
      debug?: boolean
      /**
       * Verifier-core call-time options surfaced verbatim on every
       * `verifyPresentation` / `verifyCredential` invocation for this
       * exchange. Workflows that don't call verifier-core ignore this
       * field; the schema accepts it universally so a single CLI flag
       * (`--verbose` / `--timing`) works across workflows.
       *
       * - `verbose`: when true, verifier-core returns every check that
       *   ran on `results[]` (otherwise only failures + explicit
       *   skips). Per-suite `summary[]` is populated either way.
       * - `timing`: when true, every result carries `timing` rollups
       *   ({@link App.TaskTiming}).
       */
      options?: {
        verbose?: boolean
        timing?: boolean
      }
    }

    interface ExchangeDetailBase {
      // Local metadata
      tenantName: string
      workflowId: SupportedWorkflowIds

      // VC-API metadata
      exchangeId: string
      expires: string
      state: ExchangeState
      variables: BaseVariables
    }

    interface DcqlClaim {
      id?: string
      path: string[]
      values?: string[]
    }

    interface ExchangeDetailClaim extends ExchangeDetailBase {
      workflowId: 'claim'
      variables: BaseVariables & {
        vc: string
        results?: {
          default: {
            verifiableCredential: any[]
            /** Compatibility-fix log entries; populated only when `variables.debug === true`. */
            compatLog?: CheckResult[]
          }
        }
      }
    }

    interface ExchangeDetailDidAuth extends ExchangeDetailBase {
      workflowId: 'didAuth'
      variables: BaseVariables & {
        results?: {
          default: {
            holder: string
            /** Compatibility-fix log entries; populated only when `variables.debug === true`. */
            compatLog?: CheckResult[]
          }
        }
      }
    }

    /**
     * Problem detail per RFC 9457.
     * Used in CheckResult failure outcomes.
     */
    interface ProblemDetail {
      type: string
      title: string
      detail: string
      status?: number
      [key: string]: any
    }

    /**
     * Check result from verifier-core suite-based verification.
     * Replaces the legacy VerificationStepResult format.
     */
    interface CheckResult {
      /**
       * Dot-separated namespaced id assigned by `verifier-core`
       * post-`runSuites` (e.g. `"cryptographic.core.proof-exists"`).
       * Service-local synthetic checks (compat-fix log entries) use
       * the reserved `"compat.<obj-type>.<fix-name>"` namespace so
       * UI consumers can prefix-filter them out.
       */
      id: string
      /** Discriminated outcome */
      outcome:
        | { status: 'success'; message: string }
        | { status: 'failure'; problems: ProblemDetail[] }
        | { status: 'skipped'; reason: string }
      /** Whether this check failure is fatal to overall verification */
      fatal?: boolean
      /** Per-check timing; only present when verifier-core was called with `timing: true`. */
      timing?: TaskTiming
    }

    /** Re-export of verifier-core's `SuiteSummary` for use by app code. */
    type SuiteSummary = VerifierCoreSuiteSummary
    /** Re-export of verifier-core's `TaskTiming` for use by app code. */
    type TaskTiming = VerifierCoreTaskTiming

    /**
     * Per-credential verification result from verifier-core.
     *
     * Field name `verifiableCredential` mirrors verifier-core's public
     * shape (post-1.0) and the W3C / VCALM property name, so the result
     * object can be spread into a VCALM exchange's per-step variables and
     * accessed via `results.<step>.credentialResults[i].verifiableCredential.…`.
     */
    interface CredentialVerificationResult {
      /** True if no check returned a failure outcome */
      verified: boolean
      /** The parsed credential that was verified */
      verifiableCredential: any
      /**
       * Flat array of results from all suites for this credential. In
       * non-verbose mode (the default since verifier-core 2.0.0), this
       * carries only failures and explicit `<suite>.applies` skips;
       * passes are folded into {@link summary}. In verbose mode it
       * carries every check.
       */
      results: CheckResult[]
      /**
       * Per-suite rollup. Always populated by verifier-core 2.x
       * regardless of `verbose`. Primary surface for UI rendering.
       *
       * Optional during the multi-phase migration in the
       * `verifier-core-2-results-consumption` plan; phase 7 makes it
       * required.
       */
      summary: SuiteSummary[]
      /**
       * Stable id of the matched recognizer (e.g. `"obv3p0.openbadge"`)
       * when the recognition pipeline produced a normalized form.
       */
      recognizedProfile?: string
      /**
       * Normalized view of the credential, produced by a recognizer.
       * Cast to the recognizer-specific shape based on
       * {@link recognizedProfile}.
       */
      normalizedVerifiableCredential?: unknown
      /** Inclusive top-level timing; only present when `timing: true`. */
      timing?: TaskTiming
      /** True when produced under a non-default suite-phase filter. */
      partial?: boolean
    }

    /**
     * Legacy verification step result format.
     * @deprecated Kept for backward compatibility. Use CheckResult instead.
     */
    interface VerificationStepResult {
      id: string
      valid: boolean
      error?: {
        name: string
        message: string
        stackTrace?: any
      }
      foundInRegistries?: string[]
      registriesNotLoaded?: string[]
    }

    /**
     * Verification result matching the new verifier-core format.
     * Note: This is a breaking change from the old format which used
     * verifiablePresentation/errors/log structure.
     */
    interface VerificationResult {
      /** Overall verification status - true if no fatal failures */
      verified: boolean

      /** Presentation-level check results (VP signature verification) */
      presentationResults: CheckResult[]

      /** Per-credential verification results */
      credentialResults: CredentialVerificationResult[]

      /** Credentials that matched the claims requirements */
      matchedCredentials: any[]

      /**
       * Presentation-level per-suite rollup; per-credential rollups live
       * on each `credentialResults[i].summary`.
       */
      summary: SuiteSummary[]

      /** The parsed VP, if available from verifier-core. */
      verifiablePresentation?: unknown

      /**
       * Compatibility-fix log entries gated on `variables.debug === true`.
       * Each entry has an `id` of the form `compat.<obj-type>.<fix-name>`.
       */
      compatLog?: CheckResult[]

      /** Inclusive top-level timing; only present when `timing: true`. */
      timing?: TaskTiming

      /** True when produced under a non-default suite-phase filter. */
      partial?: boolean

      /** Optional claims validation details */
      claimsValidation?: {
        extractedClaims: Record<string, any>
        requiredClaims: DcqlClaim[]
        matched: boolean
        missingClaims?: string[]
      }

      /** Optional issuer validation details */
      issuerValidation?: {
        trustedIssuers: string[]
        trustedRegistries: string[]
        issuerFound: boolean
        registryMatch: boolean
      }
    }

    /** Lifecycle status of the asynchronous verify-task pass for a verify exchange. */
    type VerifyTaskStatus =
      | 'queued'
      | 'running'
      | 'succeeded'
      | 'failed'
      | 'gave-up'

    /**
     * Metadata for the asynchronous Open Badges verification pass attached
     * to a verify exchange's `variables`.
     *
     * The synchronous POST handler runs the default verifier-core suites
     * inline and persists the partial result; if any embedded credential is
     * an Open Badges credential, it also persists a `VerifyTask` and
     * enqueues a background worker that re-verifies those credentials with
     * the OB suite. Workers commit through `saveExchangeWithCAS` keyed on
     * `attemptId`, so a stale worker whose attempt was superseded by a
     * sweep cannot overwrite a newer commit.
     */
    interface VerifyTask {
      /**
       * Generation token for the *current attempt*. Bumped on retry so
       * stale workers detect they were superseded.
       */
      attemptId: string
      /** ISO 8601 wall-clock when the current attempt was queued. */
      queuedAt: string
      /** ISO 8601 wall-clock when the current attempt began executing. */
      startedAt?: string
      /**
       * ISO 8601 wall-clock by which this attempt must finish; otherwise it
       * is eligible for retry on the next GET-driven sweep.
       */
      deadlineAt: string
      /** 1-indexed attempt counter (initial attempt is `1`). */
      attempt: number
      /** Maximum attempts (initial + retries) before giving up. */
      maxAttempts: number
      /**
       * Indices into `variables.results.default.credentialResults` that
       * still need OB processing on this attempt.
       */
      openBadgesCredentialIndices: number[]
      /** Lifecycle status. */
      status: VerifyTaskStatus
      /** Optional summary of the most recent failure for diagnostics. */
      lastError?: { message: string; at: string }
    }

    interface ExchangeDetailVerify extends ExchangeDetailBase {
      workflowId: 'verify'
      variables: BaseVariables & {
        vprContext: string[]
        vprCredentialType: string[]
        trustedIssuers: string[]
        trustedRegistries?: string[]
        vprClaims: DcqlClaim[]
        results?: { default: VerificationResult }
        verifyTask?: VerifyTask
      }
    }

    interface WorkflowStep {
      createChallenge: boolean
      verifiablePresentationRequest: {
        query: Array<{ type: string } & Record<string, any>> // Simplistic for now
      }
    }

    interface Workflow {
      id: SupportedWorkflowIds
      steps: Record<string, WorkflowStep>
      initialStep: string
      credentialTemplates?: Array<{
        id: string
        type: 'handlebars' // TODO: add 'jsonata'
        template: string
      }>
    }

    interface VPR {
      query: {
        type: 'DIDAuthentication' | 'QueryByExample'
      } & Record<string, unknown>
      interact: {
        service: Array<{
          type:
            | 'VerifiableCredentialApiExchangeService'
            | 'UnmediatedPresentationService2021'
            | 'CredentialHandlerService'
          serviceEndpoint?: string
        }>
      }
      challenge: string
      domain: string
      /** What this endpoint can verify on incoming presentations (not issuance policy). */
      acceptedCryptosuites?: Array<{ cryptosuite: string }>
    }

    interface Protocols {
      vcapi?: string
      verifiablePresentationRequest: VPR
      lcw?: string
    }

    interface DCCWalletQuery {
      retrievalId: string
      directDeepLink: string
      vprDeepLink: string
      chapiVPR?: VPR
      metadata?: Record<string, unknown>
    }
  }
}

export {}
