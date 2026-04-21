import { saveExchange } from '../transactionManager.js'
import { vcApiExchangeCreateSchema, baseVariablesSchema } from '../schema.js'
import {
  type CheckResult,
  type PresentationVerificationResult
} from '@digitalcredentials/verifier-core'
import { isOpenBadgeCredential } from '@digitalcredentials/verifier-core/openbadges'
import { z } from 'zod'
import { newVerifyTask } from '../lib/verify-task/verify-task.js'
import { enqueueVerifyTask } from '../lib/verify-task/enqueue-verify-task.js'
import {
  named
  // @ts-ignore no type definitions for this package
} from '@digitalbazaar/credentials-context'
import { assertValidVerifiablePresentationStructure } from '../lib/data/verifiable-presentation/assert.js'
import { parseCredential } from '../lib/data/verifiable-credential/schema.js'
import {
  problemDetailResponse,
  MALFORMED_VALUE_ERROR
} from '../lib/errors/problem-details.js'
import { HTTPException } from 'hono/http-exception'
import { VERIFIABLE_CRYPTOSUITES } from '../lib/verifiable-cryptosuites.js'
import { mapRegistryNamesToRegistries } from '../config.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'
import { getVerifier } from '../lib/verifier.js'
import { applyFix } from '../compatibility/apply.js'
import { prepareVcalmParticipationMessage } from '../compatibility/vcalm-participation-message/index.js'
import { prepareVerifiableEntity } from '../compatibility/verifiable-entity/index.js'
import { arrayOf } from '../utils.js'

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
 * True iff `r` is a verifier-core `trust.registry.*` check result.
 *
 * Centralized so both `validateTrustedIssuers` and
 * `determineExchangeOutcome` agree on the namespace, and so the
 * suite-key migration (`r.suite === 'registry'` → `r.id`) lives in
 * exactly one place.
 */
const isTrustRegistryCheck = (r: App.CheckResult): boolean =>
  r.id.startsWith('trust.registry.')

/**
 * Bridge `verifier-core`'s still-optional `CheckResult.id` to
 * `App.CheckResult.id`, which is required.
 *
 * verifier-core 2.x emits a stable id (`<phase>.<suite>.<localPart>`)
 * post-`runSuites` for every check it produces; the optional typing
 * is purely for backwards-compat with hand-constructed literals in
 * older callers. We assert the field is present and synthesize a
 * deterministic fallback from `suite + check` if a producer somehow
 * forgot, so downstream consumers can rely on `id` without
 * widening the App type.
 */
const ensureCheckResultId = (r: CheckResult): App.CheckResult => {
  const id = r.id ?? `${r.suite}.${r.check}`
  return { ...(r as App.CheckResult), id }
}

const ensureCredentialResultIds = (
  cr: import('@digitalcredentials/verifier-core').CredentialVerificationResult
): App.CredentialVerificationResult => ({
  ...(cr as unknown as App.CredentialVerificationResult),
  results: cr.results.map(ensureCheckResultId)
})

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
  const registryChecks = credentialResult.results.filter(isTrustRegistryCheck)

  // Check if issuer was found in any trusted registry
  let registryMatch = false
  for (const check of registryChecks) {
    // Look for successful issuer registration checks
    if (check.outcome.status === 'success') {
      // Extract registry information from outcome if available
      // The verifier-core may include foundInRegistries in the outcome
      const outcome = check.outcome as {
        status: 'success'
        message: string
        foundInRegistries?: string[]
      }
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
      const registryChecks =
        credentialResult.results.filter(isTrustRegistryCheck)

      // If any registry check failed fatally, the credential is invalid
      for (const check of registryChecks) {
        if (check.fatal && check.outcome.status === 'failure') {
          return 'invalid'
        }
      }
    }
  }

  return 'complete'
}

/**
 * Apply verification results to exchange and determine state.
 *
 * When `debug=true`, `compatLog` entries are persisted on
 * `verificationResult.compatLog` so operators can see compatibility-fix
 * annotations alongside verifier-core's own check results in the UI.
 * When `debug=false`, compat entries are silently dropped.
 */
export const applyVerificationResults = async ({
  exchange,
  result,
  compatLog = [],
  debug = false
}: {
  exchange: App.ExchangeDetailVerify
  result: import('@digitalcredentials/verifier-core').PresentationVerificationResult
  compatLog?: App.CheckResult[]
  debug?: boolean
}): Promise<App.ExchangeDetailVerify> => {
  const {
    verified,
    summary: presentationSummary,
    verifiablePresentation,
    timing: topTiming,
    partial: topPartial
  } = result
  // Normalize verifier-core's optional-`id` shape onto our local
  // required-`id` `App.CheckResult` once at the boundary, so the rest
  // of this function (and every consumer downstream) deals only in
  // `App.*` types.
  const presentationResults = result.presentationResults.map(
    ensureCheckResultId
  )
  const credentialResults = result.credentialResults.map(
    ensureCredentialResultIds
  )

  // Extract and validate claims if specified
  let claimsValidation: App.VerificationResult['claimsValidation'] | undefined
  let matchedCredentials: any[] = []

  if (exchange.variables.vprClaims.length > 0) {
    const allExtractedClaims: Record<string, any> = {}
    const validCredentials: any[] = []

    for (const credentialResult of credentialResults) {
      if (credentialResult.verifiableCredential) {
        const extractedClaims = extractCredentialClaims(
          credentialResult.verifiableCredential,
          exchange.variables.vprClaims
        )
        const claimsMatch = matchClaimsAgainstRequirements(
          extractedClaims,
          exchange.variables.vprClaims
        )

        if (claimsMatch.matched) {
          validCredentials.push(credentialResult.verifiableCredential)
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
      .map((cr) => cr.verifiableCredential)
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
      if (credentialResult.verifiableCredential) {
        const validation = validateTrustedIssuers(
          credentialResult.verifiableCredential,
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

  // Build structured verification result using new verifier-core format.
  // Per-credential `summary`, `recognizedProfile`,
  // `normalizedVerifiableCredential`, `timing`, and `partial` are
  // already set on each `credentialResults[i]` by verifier-core; we
  // forward them as-is so the UI can render from `summary[]` and
  // lazy-expand into `results[]`.
  const verificationResult: App.VerificationResult = {
    verified,
    presentationResults,
    credentialResults,
    matchedCredentials,
    summary: presentationSummary,
    ...(verifiablePresentation && { verifiablePresentation }),
    ...(debug && compatLog.length > 0 && { compatLog }),
    ...(topTiming && { timing: topTiming }),
    ...(topPartial && { partial: topPartial }),
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

/**
 * Apply per-object compatibility fixes to an inbound verify-workflow request body, then perform
 * structural validation. Returns the **raw** post-compat presentation object (suitable for
 * cryptographic verification by verifier-core), the accumulated compatibility log, and the resolved
 * debug flag.
 *
 * The returned `presentation` is intentionally NOT a Zod-parsed value.
 * `verifiablePresentationSchema` may manipulate input to break canonicalization. Passing the raw
 * post-compat object through to `verifyPresentation` preserves the byte-equivalent payload the
 * wallet signed.
 *
 * Throws `HTTPException(400)` on structural failure (invalid VP, missing holder, or invalid
 * credential structure). Compatibility fix functions themselves never throw.
 */
export const preparePresentationForVerify = ({
  data,
  exchange,
  config
}: {
  data: any
  exchange: App.ExchangeDetailVerify
  config: App.Config
}): {
  presentation: Record<string, unknown>
  compatLog: App.CheckResult[]
  debug: boolean
} => {
  const debug = exchange.variables.debug ?? config.defaultExchangeDebug

  const compatLog: App.CheckResult[] = []
  const message = applyFix(
    prepareVcalmParticipationMessage(data as Record<string, unknown>),
    compatLog
  )
  const presentation = applyFix(
    prepareVerifiableEntity(
      (message.verifiablePresentation ?? message) as Record<string, unknown>
    ),
    compatLog
  )

  // Structural validation — THROWS on bad shape; the parsed value is
  // intentionally discarded so it cannot be passed to verifier-core in
  // place of the raw signed object (see assert.ts JSDoc).
  assertValidVerifiablePresentationStructure(presentation)

  if (!(presentation as { holder?: unknown }).holder) {
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

  // The schema permits zero credentials (DID-Auth-only VPs); the verify
  // workflow specifically requires at least one credential to operate on.
  if (presentation.verifiableCredential === undefined) {
    throw new HTTPException(400, {
      message: 'verifiableCredential is required for verification',
      cause: problemDetailResponse(
        'verifiableCredential is required for verification',
        [
          {
            type: `https://www.w3.org/TR/vc-data-model#${MALFORMED_VALUE_ERROR}`,
            status: 400,
            title: MALFORMED_VALUE_ERROR,
            detail:
              'at verifiablePresentation.verifiableCredential: verifiableCredential is required for verification'
          }
        ]
      )
    })
  }

  // Per-credential structural validation. Parsed VC values are discarded;
  // verifier-core extracts credentials directly from the raw VP.
  const credentials = arrayOf(
    presentation.verifiableCredential as
      | Record<string, unknown>
      | Record<string, unknown>[]
  )
  const vcErrors = credentials.flatMap((vc, i) => {
    const result = parseCredential(vc, `credential[${i}]`)
    if (!result.success) return result.problemDetails
    return []
  })
  if (vcErrors.length > 0) {
    throw new HTTPException(400, {
      message: 'Invalid Verifiable Credential(s)',
      cause: problemDetailResponse('Invalid Verifiable Credential(s)', vcErrors)
    })
  }

  return { presentation, compatLog, debug }
}

/**
 * Two-phase verification entry point. The synchronous request thread
 * runs verifier-core's default suites against the inbound
 * presentation; if any embedded credential is an Open Badges
 * credential the exchange stays `'active'` with a queued
 * {@link App.VerifyTask} attached, and the heavier OB pass is
 * dispatched to the in-process worker via {@link enqueueVerifyTask}.
 * Otherwise the exchange is finalized to `'complete'` / `'invalid'`
 * inline (legacy behavior).
 *
 * Either way the response body is the existing `{}` (or
 * `{ redirectUrl }`) shape — clients observe the async pass purely
 * via subsequent GETs (which hit the GET-driven sweep).
 */
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
  const { presentation, compatLog, debug } = preparePresentationForVerify({
    data,
    exchange,
    config
  })

  const registries = mapRegistryNamesToRegistries(
    exchange.variables.trustedRegistries &&
      exchange.variables.trustedRegistries.length > 0
      ? exchange.variables.trustedRegistries
      : config.defaultTrustedRegistryNames,
    config.knownRegistries
  )

  // Pass the RAW post-compat presentation. verifier-core's TS interface
  // declares `type: string` but accepts `string[]` at runtime per W3C spec.
  //
  // `variables.options.{verbose,timing}` are surfaced verbatim on every
  // verifier-core call so an exchange creator (UI or CLI) can opt into
  // the verbose / timing modes documented in
  // `verifier-core/docs/api/verification-results.md`.
  const verifierOptions = exchange.variables.options ?? {}
  const result = await getVerifier().verifyPresentation({
    presentation: presentation as unknown as Parameters<
      ReturnType<typeof getVerifier>['verifyPresentation']
    >[0]['presentation'],
    challenge: exchange.variables.challenge,
    registries,
    ...(verifierOptions.verbose !== undefined && {
      verbose: verifierOptions.verbose
    }),
    ...(verifierOptions.timing !== undefined && {
      timing: verifierOptions.timing
    })
  })

  const obIndices = identifyOpenBadgesCredentialIndices(result.credentialResults)

  if (obIndices.length === 0) {
    // No async work needed — finalize and respond as today.
    const finalized = await applyVerificationResults({
      exchange,
      result,
      compatLog,
      debug
    })
    await saveExchange(finalized)
    return buildVerificationResponse(finalized)
  }

  // OB present: persist sync results + queued task, leave state='active',
  // hand off to the worker. The worker (or a sweep) recomputes state
  // when the OB pass settles.
  const intermediate = await withSyncResultsAndQueuedVerifyTask({
    exchange,
    result,
    compatLog,
    debug,
    openBadgesCredentialIndices: obIndices,
    deadlineMs: config.verifyTaskDeadlineMs,
    maxAttempts: config.verifyTaskMaxAttempts
  })
  await saveExchange(intermediate)
  enqueueVerifyTask(intermediate.exchangeId)
  return buildVerificationResponse(intermediate)
}

// ---------------------------------------------------------------------------
// Async-pass helpers
// ---------------------------------------------------------------------------

/**
 * Indices in `credentialResults` whose `verifiableCredential` is an
 * Open Badges credential per verifier-core's recognizer. Indices
 * (rather than the credentials themselves) are persisted on the
 * {@link App.VerifyTask} so the worker can re-locate each credential
 * by position when it merges OB checks back into
 * `variables.results.default.credentialResults[i].results`.
 *
 * Credentials that failed sync verification are still included — the
 * OB suite may surface independently useful diagnostics even when
 * the signature was bad.
 */
export const identifyOpenBadgesCredentialIndices = (
  credentialResults: PresentationVerificationResult['credentialResults']
): number[] => {
  const out: number[] = []
  for (let i = 0; i < credentialResults.length; i++) {
    if (isOpenBadgeCredential(credentialResults[i].verifiableCredential)) {
      out.push(i)
    }
  }
  return out
}

/**
 * Build the intermediate exchange persisted between the sync pass
 * and the async OB pass: sync results live in
 * `variables.results.default` (same shape `applyVerificationResults`
 * produces), state is forced back to `'active'`, and a fresh queued
 * {@link App.VerifyTask} is attached for the worker to consume.
 *
 * Composing on top of `applyVerificationResults` keeps a single
 * source of truth for the sync-results shape (claims validation,
 * issuer validation, compatLog handling, etc.) — we just
 * override the two fields that differ when an OB pass is pending.
 */
export const withSyncResultsAndQueuedVerifyTask = async ({
  exchange,
  result,
  compatLog,
  debug,
  openBadgesCredentialIndices,
  deadlineMs,
  maxAttempts
}: {
  exchange: App.ExchangeDetailVerify
  result: PresentationVerificationResult
  compatLog?: App.CheckResult[]
  debug?: boolean
  openBadgesCredentialIndices: number[]
  deadlineMs: number
  maxAttempts: number
}): Promise<App.ExchangeDetailVerify> => {
  const finalized = await applyVerificationResults({
    exchange,
    result,
    compatLog,
    debug
  })
  return {
    ...finalized,
    state: 'active',
    variables: {
      ...finalized.variables,
      verifyTask: newVerifyTask({
        openBadgesCredentialIndices,
        deadlineMs,
        maxAttempts
      })
    }
  }
}
