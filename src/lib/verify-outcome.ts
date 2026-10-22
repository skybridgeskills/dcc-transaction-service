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

/** True iff `r` is a verifier-core `trust.registry.*` check result. */
export const isTrustRegistryCheck = (r: App.CheckResult): boolean =>
  r.id.startsWith('trust.registry.')

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
  for (const credentialResult of result.credentialResults) {
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
