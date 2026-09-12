import { saveExchange } from '../transactionManager.js'
import {
  vcApiExchangeCreateSchema,
  baseVariablesSchema,
  profileKnobConflicts
} from '../schema.js'
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
  // @ts-expect-error no type definitions for this package
} from '@digitalbazaar/credentials-context'
import { assertValidVerifiablePresentationStructure } from '../lib/data/verifiable-presentation/assert.js'
import { parseCredential } from '../lib/data/verifiable-credential/schema.js'
import {
  problemDetailResponse,
  MALFORMED_VALUE_ERROR
} from '../lib/errors/problem-details.js'
import { HTTPException } from 'hono/http-exception'
import { VERIFIABLE_CRYPTOSUITES } from '../lib/verifiable-cryptosuites.js'
import { resolveTrustedRegistries } from '../config.js'
import { variablesFeaturesFromConfig } from '../lib/exchange-ui-features.js'
import { mintExchangeId } from '../lib/mint-exchange-id.js'
import { journalExchangeEvent } from '../journal/index.js'
import {
  ensureOid4vpState,
  resolveDelivery,
  resolveQueryLanguage
} from '../oid4vp/state.js'
import { getVerifier } from '../lib/verifier.js'
import { applyFix } from '../compatibility/apply.js'
import { prepareVcalmParticipationMessage } from '../compatibility/vcalm-participation-message/index.js'
import { prepareVerifiableEntity } from '../compatibility/verifiable-entity/index.js'
import { arrayOf } from '../utils.js'
import { wireProfileForExchange } from '../protocol-profiles/for-exchange.js'
import {
  vprAcceptedMethods,
  vprDomain,
  vprInteract,
  vprInteractServices
} from '../lib/vpr-wire.js'

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
    // ⚠️ The profile-superseded knobs — `oid4vpQueryLanguage`,
    // `oid4vpDelivery`, `vprLimitDisclosure` — are deliberately NOT re-declared
    // here. Redefining a field `baseVariablesSchema` already names identically
    // is a no-op, so do not add one. (`vprAdvertiseCryptosuites` is not a knob
    // at all, deprecated or otherwise — see `schema.ts`.)
    //
    // ⚠️ The fields BELOW that are still re-declared are re-declared because
    // they genuinely differ — `vprContext` gains `.url()`, `vprClaims` gains
    // `id`, and the verify arm makes them required. Do not "tidy" those away by
    // analogy; Zod strips what it does not name, and that is why the pattern
    // existed in the first place.
  })
})
  .superRefine((data, ctx) => {
    // ⚠️ One caller, one request, two statements about the same wire field.
    // There is no more-specific layer to break the tie, and serving either one
    // silently would make the profile name a lie about the bytes.
    for (const knob of profileKnobConflicts(
      data.variables as unknown as Record<string, unknown>
    )) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['variables', knob],
        message: `This request names the protocol profile "${String(
          (data.variables as unknown as Record<string, unknown>)
            .protocolProfileName
        )}" and also sets \`${knob}\`, which that profile supersedes. Set one or the other: the knob still works on its own, and the profile states every wire field including this one.`
      })
    }
  })

export const validateExchangeVerify = (data: unknown) => {
  return exchangeCreateSchemaVerify.parse(data)
}

export const createExchangeVerify = ({
  data,
  config,
  workflow: _workflow
}: {
  data: z.infer<typeof exchangeCreateSchemaVerify>
  config: App.Config
  workflow: App.Workflow
}) => {
  const exchange: App.ExchangeDetailVerify = {
    ...data,
    workflowId: 'verify',
    exchangeId: mintExchangeId(data.exchangeIdPrefix),
    tenantName: data.variables.tenantName ?? config.defaultTenantName,
    variables: {
      ...data.variables,
      challenge: crypto.randomUUID(),
      features: variablesFeaturesFromConfig(config),
      vprContext: data.variables.vprContext,
      vprCredentialType: data.variables.vprCredentialType,
      trustedIssuers: data.variables.trustedIssuers ?? [],
      trustedRegistries: data.variables.trustedRegistries ?? [],
      vprClaims: data.variables.vprClaims?.filter((c) => c !== undefined) ?? []
      // ⚠️ Do not re-spread the profile-superseded knobs here conditionally.
      // `...data.variables` above already carries them, so each conditional
      // spread would set a field to the value it already holds. Three
      // declarations of one knob is what made this surface worth replacing.
    },
    expires:
      data.expires ??
      new Date(Date.now() + config.exchangeTtl * 1000).toISOString(),
    state: 'pending'
  }
  // BY-VALUE NEEDS `state` AT ENVELOPE-BUILD TIME, not at first request GET.
  //
  // The by-reference arm mints `state` lazily in the `.../openid4vp/request`
  // route, because nothing before that GET has to know it. By value there IS
  // no GET: `getProtocols` builds the complete authorization request while it
  // assembles the interaction envelope, so the token must already exist.
  //
  // Minted here ONLY for the by-value arm, deliberately. Minting for both
  // would change the by-reference exchange record — and by-reference is the
  // baseline construction for delivery comparisons, which is worth nothing if
  // it is not byte-identical to every present-direction run recorded before it.
  const withState =
    resolveDelivery(exchange) === 'by-value'
      ? ensureOid4vpState(exchange).exchange
      : exchange
  // The elected delivery goes on the mint line, and it is not cosmetic.
  //
  // On the by-value arm there is no `.../openid4vp/request` GET at all, so the
  // only service-side write points between mint and the response POST are these
  // two — a refusal in between leaves an exchange record saying nothing
  // happened. Worse, an absent `request-served` line is ambiguous on its own:
  // it means either *the wallet never fetched* or *this arm issues no fetch*.
  // Stamping the delivery here is what lets a reader tell those apart without
  // inferring it from the presence of a GET that, on one arm, cannot occur.
  journalExchangeEvent(withState, 'mint', {
    expires: withState.expires,
    delivery: resolveDelivery(withState),
    queryLanguage: resolveQueryLanguage(withState),
    ...(data.exchangeIdPrefix
      ? { exchangeIdPrefix: data.exchangeIdPrefix }
      : {})
  })
  return withState
}

const getCredentialQuery = ({
  vprContext,
  vprCredentialType,
  trustedIssuers: _trustedIssuers,
  vprClaims: _vprClaims
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

  // The advertised acceptance equals the actual acceptance. `did:jwk` is here
  // because shipped wallets bind their holder key with it and our verifier
  // resolves it (see `lib/verifier-document-loader.ts`); a VPR narrower than
  // the instrument turns a conformant wallet's correct refusal into a finding
  // against the wallet, which this service forbids. Widen this list only
  // alongside the resolver — never ahead of it.
  // The shape of this VPR — a query ARRAY carrying QueryByExample entries plus
  // a constrained DIDAuthentication entry — is a function of the workflow, and
  // the workflow is named on the exchange. What a profile states is the values
  // within that shape; what the exchange states is the credential types and
  // claims. Nothing here is left to an unnamed default.
  //
  // ⚠️ Order at every read below: active profile → the historical default. No
  // per-exchange knob exists for any VPR field today, so there is no third
  // term; if one is ever added it goes FIRST, for the reason given in
  // `lib/vpr-wire.ts`.
  const wire = wireProfileForExchange(exchange)

  // DID Method NAMES, not DID scheme-plus-method: the VP Request spec
  // (https://w3c-ccg.github.io/vp-request-spec/) takes `key`, never
  // `did:key`. The prefixed form is an earlier spelling this service emitted,
  // and a verifier that compares against the bare name matches nothing and
  // refuses before signing — a fault of ours presenting as its failure.
  // ⚠️ Each of the three below is a field some verifiers OMIT and we
  // emit — every row of that differential is something we add. A stricter
  // parser choking on an optional field is the shape of the defect, so each is
  // separately omissible rather than bundled.
  const acceptedMethods = vprAcceptedMethods(wire, {
    form: 'bare-name',
    methods: ['key', 'web', 'jwk']
  })
  const didAuthQuery = {
    type: 'DIDAuthentication' as const,
    ...((wire?.vpr?.emitDidAuthenticationAcceptedCryptosuites ?? true)
      ? { acceptedCryptosuites: [...VERIFIABLE_CRYPTOSUITES] }
      : {}),
    // An empty method list omits the key. Some verifiers emit
    // `acceptedMethods` WITHOUT `acceptedCryptosuites`, which is why the two
    // are separate questions here.
    ...(acceptedMethods.length > 0 ? { acceptedMethods } : {})
  }

  const vpr = {
    query: [...queryByExampleEntries, didAuthQuery],
    ...vprInteract(
      vprInteractServices(wire, serviceEndpoint, [
        'VerifiableCredentialApiExchangeService',
        'UnmediatedPresentationService2021'
      ])
    ),
    challenge: exchange.variables.challenge,
    domain: vprDomain(
      wire,
      { exchangeHost: exchange.variables.exchangeHost, serviceEndpoint },
      'service-endpoint'
    ),
    ...((wire?.vpr?.emitAcceptedCryptosuites ?? true)
      ? { acceptedCryptosuites: [...VERIFIABLE_CRYPTOSUITES] }
      : {})
  }
  return vpr
}

/**
 * Extract claim values from a credential using path notation
 */
const extractCredentialClaims = (
  credential: Record<string, unknown>,
  claims: App.DcqlClaim[]
): Record<string, unknown> => {
  const extractedClaims: Record<string, unknown> = {}

  for (const claim of claims) {
    if (!claim.path || claim.path.length === 0) continue

    let value: unknown = credential
    let pathExists = true

    for (const pathSegment of claim.path) {
      if (value && typeof value === 'object' && pathSegment in value) {
        value = (value as Record<string, unknown>)[pathSegment]
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
  extractedClaims: Record<string, unknown>,
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
  credential: Record<string, unknown>,
  trustedIssuers: string[],
  trustedRegistries: string[],
  credentialResult: App.CredentialVerificationResult
): { issuerFound: boolean; registryMatch: boolean } => {
  const rawIssuer = credential.issuer
  const issuer = (typeof rawIssuer === 'object' && rawIssuer !== null && 'id' in rawIssuer
    ? (rawIssuer as Record<string, unknown>).id
    : rawIssuer) as string
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
  let matchedCredentials: unknown[] = []

  if (exchange.variables.vprClaims.length > 0) {
    const allExtractedClaims: Record<string, unknown> = {}
    const validCredentials: unknown[] = []

    for (const credentialResult of credentialResults) {
      if (credentialResult.verifiableCredential) {
        const extractedClaims = extractCredentialClaims(
          credentialResult.verifiableCredential as Record<string, unknown>,
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
          credentialResult.verifiableCredential as Record<string, unknown>,
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
const buildVerificationResponse = (exchange: App.ExchangeDetailVerify): unknown => {
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
  data: Record<string, unknown>
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
  workflow: _workflow,
  config
}: {
  data: Record<string, unknown>
  exchange: App.ExchangeDetailVerify
  workflow: App.Workflow
  config: App.Config
}) => {
  const { presentation, compatLog, debug } = preparePresentationForVerify({
    data,
    exchange,
    config
  })

  // `undefined` (not `[]`) is what skips the issuer-registry suite — see
  // `resolveTrustedRegistries`.
  const registries = resolveTrustedRegistries(
    exchange.variables.trustedRegistries,
    config
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
