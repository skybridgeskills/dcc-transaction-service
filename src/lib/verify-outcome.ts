/**
 * How a verify exchange's verification result becomes its final state.
 *
 * A verify exchange is settled on one of two paths: the synchronous pass
 * (`applyVerificationResults` in `workflows/verifyWorkflow.ts`) when no
 * credential needs the Open Badges suites, or the asynchronous Open Badges
 * pass (`processVerifyTask` in `verify-task/verify-task-worker.ts`) when one
 * does. Both end here.
 *
 * Pure, and deliberately its own module: `verifyWorkflow.ts` imports the
 * verify-task queue, so the worker importing the workflow back would make a
 * cycle.
 */

import type {
  EntityIdentityRegistry,
  RegistryCheckPayload
} from '@digitalcredentials/verifier-core'

/** Id of verifier-core's issuer registry lookup (`registry` suite, `trust` phase). */
export const ISSUER_REGISTRY_CHECK_ID = 'trust.registry.issuer'

/**
 * Type guard for the {@link RegistryCheckPayload} verifier-core puts on the
 * issuer registry check's outcome whenever the lookup ran. `payload` is
 * typed `unknown`, and the outcome's `message` is prose — never parse it.
 */
const isRegistryCheckPayload = (
  payload: unknown
): payload is RegistryCheckPayload =>
  typeof payload === 'object' &&
  payload !== null &&
  Array.isArray((payload as RegistryCheckPayload).matches) &&
  Array.isArray((payload as RegistryCheckPayload).uncheckedRegistries)

/** The credential's issuer id: `issuer` itself, or `issuer.id`. */
const issuerIdOf = (credential: unknown): string | undefined => {
  const issuer = (credential as { issuer?: unknown } | null)?.issuer
  if (typeof issuer === 'string') return issuer
  if (typeof issuer === 'object' && issuer !== null) {
    const id = (issuer as { id?: unknown }).id
    if (typeof id === 'string') return id
  }
  return undefined
}

/**
 * Build the per-credential issuer trust record from a verification result.
 *
 * `registries` is what was handed to verifier-core for this exchange
 * (`resolveTrustedRegistries`): `undefined` when the registry check was
 * skipped. Its names are the `consultedRegistries`.
 *
 * Returns `undefined` — nothing to report — unless the exchange set
 * `trustedIssuers` or `requireTrustedIssuer`, or some credential's registry
 * lookup actually ran (so a deployment-default lookup still reaches callers
 * as a warning).
 *
 * ⚠️ Rebuild it whenever `credentialResults` changes. The async Open Badges
 * pass re-runs the registry check, so the worker derives it again from the
 * replaced results rather than carrying the sync pass's record over.
 */
export const deriveIssuerValidation = (
  result: Pick<App.VerificationResult, 'credentialResults'>,
  exchange: App.ExchangeDetailVerify,
  registries: EntityIdentityRegistry[] | undefined
): App.IssuerValidation | undefined => {
  const requireTrustedIssuer = exchange.variables.requireTrustedIssuer === true
  const trustedIssuers = exchange.variables.trustedIssuers ?? []
  const registryRows = result.credentialResults.map((cr) =>
    cr.results.find((r) => r.id === ISSUER_REGISTRY_CHECK_ID)
  )
  const anyLookupRan = registryRows.some(
    (r) => r !== undefined && r.outcome.status !== 'skipped'
  )
  if (trustedIssuers.length === 0 && !requireTrustedIssuer && !anyLookupRan) {
    return undefined
  }

  const consultedRegistries = (registries ?? []).map((r) => r.name)

  const credentials = result.credentialResults.map(
    (cr, index): App.CredentialIssuerValidation => {
      const issuer = issuerIdOf(cr.verifiableCredential)
      const onAllowlist = issuer !== undefined && trustedIssuers.includes(issuer)
      const outcome = registryRows[index]?.outcome
      const payload =
        outcome && outcome.status !== 'skipped' && isRegistryCheckPayload(outcome.payload)
          ? outcome.payload
          : undefined
      const registryMatches = (payload?.matches ?? []).map((m) => ({
        registry: m.registry.name,
        ...(m.entity?.name !== undefined && { entityName: m.entity.name }),
        ...(m.entity?.url !== undefined && { entityUrl: m.entity.url })
      }))
      // A failed lookup with no payload (verifier-core's `REGISTRY_ERROR`:
      // the lookup threw) heard from no registry, so none was checked.
      const uncheckedRegistries = payload
        ? payload.uncheckedRegistries.map((r) => r.name)
        : outcome?.status === 'failure'
          ? consultedRegistries
          : []
      return {
        index,
        ...(issuer !== undefined && { issuer }),
        onAllowlist,
        registryMatches,
        uncheckedRegistries,
        trusted: onAllowlist || registryMatches.length > 0
      }
    }
  )

  return { requireTrustedIssuer, trustedIssuers, consultedRegistries, credentials }
}

/**
 * Whether a presentation's own checks passed: no fatal check failed.
 *
 * The same rule verifier-core applies inside `verifyPresentation`
 * (`hasFatalFailures`, which it does not export). A non-fatal failure is
 * a warning and never flips this.
 */
export const presentationVerified = (
  presentationResults: readonly App.CheckResult[]
): boolean =>
  !presentationResults.some((r) => r.fatal && r.outcome.status === 'failure')

/**
 * Recompute a stored result's top-level `verified` from its parts, the way
 * verifier-core composes a presentation's `verified`: the presentation's
 * own checks passed and every credential verified.
 *
 * ⚠️ Recompute, never AND with the previous top-level value. After the Open
 * Badges pass replaces a credential's entry, the old top-level flag still
 * carries that credential's old verdict.
 */
export const recomputeVerified = (result: App.VerificationResult): boolean =>
  presentationVerified(result.presentationResults) &&
  result.credentialResults.every((cr) => cr.verified)

/**
 * Decide a verify exchange's final state from its verification result.
 *
 * ⚠️ **The only place verify-exchange state is decided.** Both the sync
 * path and the async Open Badges worker call this, so a rule added here
 * applies to every verify exchange. Before it existed, the worker set state
 * from `verified` by its own rule, and policy in the sync path's outcome
 * logic silently skipped every exchange carrying an Open Badges credential.
 * Do not reintroduce a second decision on either path.
 *
 * ⚠️ **Issuer trust is a warning unless the exchange opts in.** Most issuers
 * are in no registry this service can reach, so an issuer that is not on the
 * allowlist and matched no registry is reported on `issuerValidation` and
 * left for the caller to judge. Only `requireTrustedIssuer: true` makes it
 * `invalid` — and then "could not check some registries" is not trust
 * either. `trustedRegistries` never gates; it only chooses who is asked.
 */
export const decideExchangeState = (
  result: App.VerificationResult,
  exchange: App.ExchangeDetailVerify
): 'complete' | 'invalid' => {
  // If verifier-core says verification failed, it's invalid
  if (!result.verified) {
    return 'invalid'
  }

  // Check that all credentials passed verification
  if (!result.credentialResults.every((cr) => cr.verified)) {
    return 'invalid'
  }

  if (exchange.variables.requireTrustedIssuer === true) {
    // Opted in, so a missing record cannot pass as trusted.
    const credentials = result.issuerValidation?.credentials
    if (!credentials || credentials.some((c) => !c.trusted)) {
      return 'invalid'
    }
  }

  return 'complete'
}
