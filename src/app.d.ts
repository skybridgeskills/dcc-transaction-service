declare global {
  namespace App {
    interface Tenant {
      tenantName: string
      tenantToken: string
      origin?: string
    }

    interface Config {
      port: number
      defaultExchangeHost: string
      exchangeTtl: number
      statusService: string
      signingService: string
      defaultWorkflow: string
      defaultTenantName: string
      keyvFilePath?: string
      redisUri?: string
      keyvWriteDelayMs: number
      keyvExpiredCheckDelayMs: number
      tenants: Record<string, Tenant>
      tenantAuthenticationEnabled: boolean
      defaultTrustedRegistries: string[]
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
      result?: any
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
      }
    }

    interface ExchangeDetailDidAuth extends ExchangeDetailBase {
      workflowId: 'didAuth'
    }

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

    interface VerificationResult {
      presentationResult: {
        signature: 'VALID' | 'INVALID' | 'UNSIGNED'
        errors?: Array<{
          name: string
          message: string
          stackTrace?: any
        }>
      }
      credentialResults: Array<{
        credential: any
        log: VerificationStepResult[]
        errors?: Array<{
          name: string
          message: string
          stackTrace?: any
        }>
      }>
      overallOutcome: 'complete' | 'invalid'
      matchedCredentials: any[]
      claimsValidation?: {
        extractedClaims: Record<string, any>
        requiredClaims: DcqlClaim[]
        matched: boolean
        missingClaims?: string[]
      }
      issuerValidation?: {
        trustedIssuers?: string[]
        trustedRegistries?: string[]
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
        verificationResult?: VerificationResult
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
