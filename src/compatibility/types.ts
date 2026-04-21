/**
 * Return shape for every compatibility-fix function: the (possibly patched)
 * value plus zero or more `CheckResult` log entries describing what was done.
 *
 * Compat entries use {@link App.CheckResult}, the local result shape that
 * post-dates the verifier-core 2.x hard cut (required `id`, no `check` /
 * `suite` / `timestamp`). Verifier-core's older optional-`id`,
 * required-`check` / `suite` shape is bridged at the boundary in
 * `verifyWorkflow.ts`; the rest of the service deals only in
 * `App.CheckResult`.
 */
export type CompatibilityResult<T> = {
  result: T
  log: App.CheckResult[]
}

/**
 * Build a success-outcome `CheckResult` tagged for the compatibility suite.
 * Use from inside a fix function when it has actually applied a change.
 *
 * The emitted `id` is `compat.<fixId>` with `:` characters in `fixId`
 * normalized to `.` so it lives in the same dotted namespace as the
 * verifier-core ids (`<phase>.<suite>.<localPart>`). For an existing
 * `FIX_ID = "verifiable-entity:ed25519-signature-2020-context"` the
 * resulting id is `"compat.verifiable-entity.ed25519-signature-2020-context"`.
 *
 * UI consumers can `id.startsWith('compat.')` to separate compat-log
 * entries from real verifier checks; outcome-classification code can
 * still rely on `outcome.status` independently.
 *
 * @param fixId  kebab-/colon-cased id, e.g.
 *   `wrap-bare-presentation` or
 *   `verifiable-entity:ed25519-signature-2020-context`
 * @param message  human-readable summary of what the fix did
 */
export const compatibilityCheckResult = (
  fixId: string,
  message: string
): App.CheckResult => ({
  id: `compat.${fixId.replace(/:/g, '.')}`,
  outcome: { status: 'success', message },
  fatal: false
})
