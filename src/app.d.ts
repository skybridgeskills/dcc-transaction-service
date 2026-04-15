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
      /** HS256 secret for OAuth access JWTs (client_credentials). Empty disables issuance. */
      accessJwtSecret: string
      keyvFilePath?: string
      redisUri?: string
      keyvWriteDelayMs: number
      keyvExpiredCheckDelayMs: number
      tenants: Record<string, Tenant>
      tenantAuthenticationEnabled: boolean
      defaultTrustedRegistryNames: string[]
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
        results?: { default: { verifiableCredential: any[] } }
      }
    }

    interface ExchangeDetailDidAuth extends ExchangeDetailBase {
      workflowId: 'didAuth'
      variables: BaseVariables & {
        results?: { default: { holder: string } }
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
     */
    interface CredentialVerificationResult {
      /** True if no check returned a failure outcome */
      verified: boolean
      /** The parsed credential that was verified */
      credential: any
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
