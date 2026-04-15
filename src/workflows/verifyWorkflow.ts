import { preparePresentation } from '../verifiablePresentation.js'
import { saveExchange } from '../transactionManager.js'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
import { verifyPresentation } from '@digitalcredentials/verifier-core'
import { z } from 'zod'
import {
  named
  // @ts-ignore no type definitions for this package
} from '@digitalbazaar/credentials-context'
import { verifiablePresentationSchema } from '../lib/data/verifiable-presentation/schema.js'
import { parseCredential } from '../lib/data/verifiable-credential/schema.js'
import {
  zodProblemDetails,
  problemDetailResponse,
  MALFORMED_VALUE_ERROR
} from '../lib/errors/problem-details.js'
import { HTTPException } from 'hono/http-exception'
import { VERIFIABLE_CRYPTOSUITES } from '../lib/verifiable-cryptosuites.js'
import { mapRegistryNamesToRegistries } from '../config.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'
import { getVerifierVerificationFetchers } from '../lib/verifier-keyv-store.js'

const { httpGet: verifierHttpGet, cache: verifierCache } =
  getVerifierVerificationFetchers()

// Extract context URLs from the named Map using short names
const CONTEXT_URL_V1 =
  named.get('v1')?.id || 'https://www.w3.org/2018/credentials/v1'
const CONTEXT_URL_V2 =
  named.get('v2')?.id || 'https://www.w3.org/ns/credentials/v2'

export const exchangeCreateSchemaVerify = vcApiExchangeCreateSchema.extend({
  variables: baseVariablesSchema.extend({
    vprContext: z.array(z.string().url()),
    vprCredentialType: z.array(z.string()),
    trustedIssuers: z.array(z.string()).optional(),
    trustedRegistries: z.array(z.string()).optional(),
    vprClaims: z.array(
      z
        .object({
          id: z.string().optional(),
          path: z.array(z.string()),
          values: z.array(z.string()).optional()
        })
        .optional()
    )
  })
})

export const validateExchangeVerify = (data: any) => {
  return exchangeCreateSchemaVerify.parse(data)
}

export const createExchangeVerify = ({
  data,
  config,
  workflow
}: {
  data: z.infer<typeof exchangeCreateSchemaVerify>
  config: App.Config
  workflow: App.Workflow
}) => {
  const exchange: App.ExchangeDetailVerify = {
    ...data,
    workflowId: 'verify',
    exchangeId: crypto.randomUUID(),
    tenantName: data.variables.tenantName,
    variables: {
      ...data.variables,
      challenge: crypto.randomUUID(),
      features: variablesFeaturesFromConfig(config),
      vprContext: data.variables.vprContext,
      vprCredentialType: data.variables.vprCredentialType,
      trustedIssuers: data.variables.trustedIssuers ?? [],
      trustedRegistries: data.variables.trustedRegistries ?? [],
      vprClaims: data.variables.vprClaims?.filter((c) => c !== undefined) ?? []
    },
    expires:
      data.expires ??
      new Date(Date.now() + config.exchangeTtl * 1000).toISOString(),
    state: 'pending'
  }
  return exchange
}

const getCredentialQuery = ({
  vprContext,
  vprCredentialType,
  trustedIssuers,
  vprClaims
}: {
  vprContext: string[]
  vprCredentialType: string[]
  trustedIssuers: string[]
  vprClaims: App.DcqlClaim[]
}) => {
  const example: Record<string, unknown> = { type: vprCredentialType }
  if (vprContext.length > 0) {
    example['@context'] = vprContext
  }
  return { example }
}

export const getVerifyVPR = (exchange: App.ExchangeDetailVerify) => {
  const { vprContext, vprCredentialType, trustedIssuers, vprClaims } =
    exchange.variables
  const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

  const specificContexts = vprContext.filter(
    (c) => ![CONTEXT_URL_V1, CONTEXT_URL_V2].includes(c)
  )

  const credentialQueries =
    vprContext.length === 0
      ? // No context constraint — single context-free query
        [
          getCredentialQuery({
            vprContext: [],
            vprCredentialType,
            trustedIssuers,
            vprClaims
          })
        ]
      : vprContext.some((c) => [CONTEXT_URL_V1, CONTEXT_URL_V2].includes(c))
        ? [
            getCredentialQuery({
              vprContext,
              vprCredentialType,
              trustedIssuers,
              vprClaims
            })
          ]
        : [
            // VCDM V1 credential query
            getCredentialQuery({
              vprContext: [CONTEXT_URL_V1, ...specificContexts],
              vprCredentialType,
              trustedIssuers,
              vprClaims
            }),
            // VCDM V2 credential query
            getCredentialQuery({
              vprContext: [CONTEXT_URL_V2, ...specificContexts],
              vprCredentialType,
              trustedIssuers,
              vprClaims
            })
          ]

  const queryByExampleEntries = credentialQueries.map((cq) => ({
    type: 'QueryByExample' as const,
    credentialQuery: cq
  }))

  const didAuthQuery = {
    type: 'DIDAuthentication' as const,
    acceptedCryptosuites: [...VERIFIABLE_CRYPTOSUITES],
    acceptedMethods: [{ method: 'did:key' }, { method: 'did:web' }]
  }

  const vpr = {
    query: [...queryByExampleEntries, didAuthQuery],
    interact: {
      service: [
        {
          type: 'VerifiableCredentialApiExchangeService',
          serviceEndpoint
        },
        {
          type: 'UnmediatedPresentationService2021',
          serviceEndpoint
        }
      ]
    },
    challenge: exchange.variables.challenge,
    domain: serviceEndpoint,
    acceptedCryptosuites: [...VERIFIABLE_CRYPTOSUITES]
  }
  return vpr
}

/**
 * Extract claim values from a credential using path notation
 */
const extractCredentialClaims = (
  credential: any,
  claims: App.DcqlClaim[]
): Record<string, any> => {
  const extractedClaims: Record<string, any> = {}

  for (const claim of claims) {
    if (!claim.path || claim.path.length === 0) continue

    let value = credential
    let pathExists = true

    for (const pathSegment of claim.path) {
      if (value && typeof value === 'object' && pathSegment in value) {
        value = value[pathSegment]
      } else {
        pathExists = false
        break
      }
    }

    if (pathExists) {
      const pathKey = claim.path.join('.')
      extractedClaims[pathKey] = value
    }
  }

  return extractedClaims
}

/**
 * Match extracted claims against VPR requirements
 */
const matchClaimsAgainstRequirements = (
  extractedClaims: Record<string, any>,
  requiredClaims: App.DcqlClaim[]
): { matched: boolean; missingClaims?: string[] } => {
  const missingClaims: string[] = []

  for (const claim of requiredClaims) {
    if (!claim.path || claim.path.length === 0) continue

    const pathKey = claim.path.join('.')
    const extractedValue = extractedClaims[pathKey]

    if (extractedValue === undefined) {
      missingClaims.push(pathKey)
      continue
    }

    // If specific values are required, check if extracted value matches
    if (claim.values && claim.values.length > 0) {
      const extractedValueStr = String(extractedValue)
      if (!claim.values.includes(extractedValueStr)) {
        missingClaims.push(
          `${pathKey} (expected: ${claim.values.join(', ')}, got: ${extractedValueStr})`
        )
      }
    }
  }

  return {
    matched: missingClaims.length === 0,
    missingClaims: missingClaims.length > 0 ? missingClaims : undefined
  }
}

/**
 * Validate trusted issuers against credential issuer.
 *
 * Searches the credential's verification results for registry suite checks
 * to determine if the issuer is in any trusted registries.
 */
const validateTrustedIssuers = (
  credential: any,
  trustedIssuers: string[],
  trustedRegistries: string[],
  credentialResult: App.CredentialVerificationResult
): { issuerFound: boolean; registryMatch: boolean } => {
  const issuer = credential.issuer?.id || credential.issuer
  const issuerFound = trustedIssuers.includes(issuer)

  // Find all registry suite checks in the results array
  const registryChecks = credentialResult.results.filter(
    (check) => check.suite === 'registry'
  )

  // Check if issuer was found in any trusted registry
  let registryMatch = false
  for (const check of registryChecks) {
    // Look for successful issuer registration checks
    if (check.outcome.status === 'success') {
      // Extract registry information from outcome if available
      // The verifier-core may include foundInRegistries in the outcome
      const outcome = check.outcome as { status: 'success'; message: string; foundInRegistries?: string[] }
      if (outcome.foundInRegistries && outcome.foundInRegistries.length > 0) {
        // Check if any of the found registries match our trusted registries
        registryMatch = trustedRegistries.some((trusted) =>
          outcome.foundInRegistries!.includes(trusted)
        )
        if (registryMatch) break
      } else if (trustedRegistries.length === 0) {
        // No specific trusted registries required, any successful registry check passes
        registryMatch = true
        break
      }
    }
  }

  return { issuerFound, registryMatch }
}

/**
 * Determine overall exchange outcome based on verification results.
 *
 * With the new verifier-core format, this is simplified because:
 * - The `verified` boolean already accounts for fatal check failures
 * - Each credential has its own `verified` status
 *
 * We only need additional logic if there are trusted issuer requirements
 * that weren't enforced as fatal checks by verifier-core.
 */
const determineExchangeOutcome = (
  verified: boolean,
  credentialResults: App.CredentialVerificationResult[],
  exchange: App.ExchangeDetailVerify
): 'complete' | 'invalid' => {
  // If verifier-core says verification failed, it's invalid
  if (!verified) {
    return 'invalid'
  }

  // Check that all credentials passed verification
  for (const credentialResult of credentialResults) {
    if (!credentialResult.verified) {
      return 'invalid'
    }

    // If trusted issuers are specified, verify the issuer check passed
    if (exchange.variables.trustedIssuers.length > 0) {
      const registryChecks = credentialResult.results.filter(
        (check) => check.suite === 'registry'
      )

      // If any registry check failed fatally, the credential is invalid
      for (const check of registryChecks) {
        if (
          check.fatal &&
          check.outcome.status === 'failure'
        ) {
          return 'invalid'
        }
      }
    }
  }

  return 'complete'
}

/**
 * Apply verification results to exchange and determine state
 */
export const applyVerificationResults = async ({
  exchange,
  result
}: {
  exchange: App.ExchangeDetailVerify
  result: import('@digitalcredentials/verifier-core').PresentationVerificationResult
}): Promise<App.ExchangeDetailVerify> => {
  const { verified, presentationResults, credentialResults, allResults } = result

  // Extract and validate claims if specified
  let claimsValidation: App.VerificationResult['claimsValidation'] | undefined
  let matchedCredentials: any[] = []

  if (exchange.variables.vprClaims.length > 0) {
    const allExtractedClaims: Record<string, any> = {}
    const validCredentials: any[] = []

    for (const credentialResult of credentialResults) {
      if (credentialResult.credential) {
        const extractedClaims = extractCredentialClaims(
          credentialResult.credential,
          exchange.variables.vprClaims
        )
        const claimsMatch = matchClaimsAgainstRequirements(
          extractedClaims,
          exchange.variables.vprClaims
        )

        if (claimsMatch.matched) {
          validCredentials.push(credentialResult.credential)
          Object.assign(allExtractedClaims, extractedClaims)
        }
      }
    }

    matchedCredentials = validCredentials

    claimsValidation = {
      extractedClaims: allExtractedClaims,
      requiredClaims: exchange.variables.vprClaims,
      matched: validCredentials.length > 0,
      missingClaims:
        validCredentials.length === 0
          ? ['No credentials matched required claims']
          : undefined
    }
  } else {
    // No claims specified, all credentials are considered valid
    matchedCredentials = credentialResults
      .map((cr) => cr.credential)
      .filter(Boolean)
  }

  // Validate trusted issuers if specified
  let issuerValidation: App.VerificationResult['issuerValidation'] | undefined
  if (
    exchange.variables.trustedIssuers.length > 0 ||
    (exchange.variables.trustedRegistries &&
      exchange.variables.trustedRegistries.length > 0)
  ) {
    let allIssuersValid = true

    for (const credentialResult of credentialResults) {
      if (credentialResult.credential) {
        const validation = validateTrustedIssuers(
          credentialResult.credential,
          exchange.variables.trustedIssuers,
          exchange.variables.trustedRegistries || [],
          credentialResult
        )

        if (!validation.issuerFound && !validation.registryMatch) {
          allIssuersValid = false
          break
        }
      }
    }

    issuerValidation = {
      trustedIssuers: exchange.variables.trustedIssuers,
      trustedRegistries: exchange.variables.trustedRegistries || [],
      issuerFound: allIssuersValid,
      registryMatch: allIssuersValid
    }
  }

  // Determine overall outcome
  const overallOutcome = determineExchangeOutcome(
    verified,
    credentialResults,
    exchange
  )

  // Build structured verification result using new verifier-core format
  const verificationResult: App.VerificationResult = {
    verified,
    presentationResults,
    credentialResults,
    allResults,
    matchedCredentials,
    ...(claimsValidation && { claimsValidation }),
    ...(issuerValidation && { issuerValidation })
  }

  // Update exchange state and variables
  const updatedExchange: App.ExchangeDetailVerify = {
    ...exchange,
    state: overallOutcome === 'complete' ? 'complete' : 'invalid',
    variables: {
      ...exchange.variables,
      results: {
        default: verificationResult
      }
    }
  }

  return updatedExchange
}

/**
 * Build verification response body
 */
const buildVerificationResponse = (exchange: App.ExchangeDetailVerify): any => {
  if (exchange.variables.redirectUrl) {
    return { redirectUrl: exchange.variables.redirectUrl }
  }
  return {}
}

export const participateInVerifyExchange = async ({
  data,
  exchange,
  workflow,
  config
}: {
  data: any
  exchange: App.ExchangeDetailVerify
  workflow: App.Workflow
  config: App.Config
}) => {
  const presentation = preparePresentation(data)

  // 1. VP safeParse
  const vpResult = verifiablePresentationSchema.safeParse(presentation)
  if (!vpResult.success) {
    console.error('VP validation failed:', vpResult.error.issues)
    throw new HTTPException(400, {
      message: 'Invalid Verifiable Presentation',
      cause: problemDetailResponse(
        'Invalid Verifiable Presentation',
        zodProblemDetails(vpResult.error.issues, 'verifiablePresentation')
      )
    })
  }

  // 2. Holder is required for verify/didAuth workflows
  if (!vpResult.data.holder) {
    throw new HTTPException(400, {
      message: 'holder is required for verification',
      cause: problemDetailResponse('holder is required for verification', [
        {
          type: `https://www.w3.org/TR/vc-data-model#${MALFORMED_VALUE_ERROR}`,
          status: 400,
          title: MALFORMED_VALUE_ERROR,
          detail:
            'at verifiablePresentation.holder: holder is required for verification'
        }
      ])
    })
  }

  // 3. Per-credential VC validation
  const credentials = vpResult.data.verifiableCredential
  const vcErrors = credentials.flatMap((vc, i) => {
    const result = parseCredential(vc, `credential[${i}]`)
    if (!result.success) return result.problemDetails
    return []
  })
  if (vcErrors.length > 0) {
    console.error('VC validation failed:', vcErrors)
    throw new HTTPException(400, {
      message: 'Invalid Verifiable Credential(s)',
      cause: problemDetailResponse('Invalid Verifiable Credential(s)', vcErrors)
    })
  }

  // Cast for verifier-core (its TS interface declares `type: string` but
  // it accepts `string[]` at runtime per W3C spec)
  const validatedPresentation = vpResult.data as unknown as Parameters<
    typeof verifyPresentation
  >[0]['presentation']

  // Determine which registries to use and map to full registry objects
  const registryNames =
    exchange.variables.trustedRegistries &&
    exchange.variables.trustedRegistries.length > 0
      ? exchange.variables.trustedRegistries
      : config.defaultTrustedRegistryNames

  const registries = mapRegistryNamesToRegistries(
    registryNames,
    config.knownRegistries
  )

  // Parsed VP matches what we send; verifier-core's VP type requires fields our
  // Zod VP shape does not model (e.g. issuer).
  const result = await verifyPresentation({
    presentation: validatedPresentation,
    challenge: exchange.variables.challenge,
    registries,
    httpGet: verifierHttpGet,
    cache: verifierCache
  })

  // Apply verification results to exchange
  const updatedExchange = await applyVerificationResults({ exchange, result })

  // Save updated exchange
  await saveExchange(updatedExchange)

  // Return appropriate response
  return buildVerificationResponse(updatedExchange)
}
