import type { EntityIdentityRegistry } from '@digitalcredentials/verifier-core'

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
       * When false, verifier-core skips the OBv3 schema suite. Set env `VERIFY_OBV3_SCHEMA=false`.
       */
      verifyObv3Schema: boolean
      /**
       * Default value for `BaseVariables.debug` when an exchange does not
       * specify it. Set env `EXCHANGE_DEBUG_DEFAULT=true` (or `1` / `yes`)
       * to enable globally.
       */
      defaultExchangeDebug: boolean
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
            /** Compatibility-fix log + verifier-core checks; populated only when `variables.debug === true`. */
            allResults?: CheckResult[]
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
            /** Compatibility-fix log + verifier-core checks; populated only when `variables.debug === true`. */
            allResults?: CheckResult[]
          }
        }
      }
    }

    /**
     * Problem detail per RFC 9457.
     * Used in CheckResult failure outcomes.
     */
    interface ProblemDetail {
      type?: string
      title?: string
      detail?: string
      status?: number
      [key: string]: any
    }

    /**
     * Check result from verifier-core suite-based verification.
     * Replaces the legacy VerificationStepResult format.
     */
    interface CheckResult {
      /** Qualified check id, e.g. "core.proof-exists" */
      check: string
      /** Suite id this check belongs to, e.g. "core" */
      suite: string
      /** Discriminated outcome */
      outcome:
        | { status: 'success'; message: string }
        | { status: 'failure'; problems: ProblemDetail[] }
        | { status: 'skipped'; reason: string }
      /** ISO 8601 timestamp when the check was executed */
      timestamp: string
      /** Whether this check failure is fatal to overall verification */
      fatal?: boolean
    }

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
      /** Flat array of results from all suites for this credential */
      results: CheckResult[]
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

      /** All check results flattened (presentation + all credentials) */
      allResults: CheckResult[]

      /** Credentials that matched the claims requirements */
      matchedCredentials: any[]

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

    interface ExchangeDetailVerify extends ExchangeDetailBase {
      workflowId: 'verify'
      variables: BaseVariables & {
        vprContext: string[]
        vprCredentialType: string[]
        trustedIssuers: string[]
        trustedRegistries?: string[]
        vprClaims: DcqlClaim[]
        results?: { default: VerificationResult }
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
