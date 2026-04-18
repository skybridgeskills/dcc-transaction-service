import type { CheckResult } from '@digitalcredentials/verifier-core'

/**
 * Return shape for every compatibility-fix function: the (possibly patched)
 * value plus zero or more `CheckResult` log entries describing what was done.
 *
 * The `CheckResult` shape is the same one verifier-core uses, so compat log
 * entries can be merged into `verificationResult.allResults` without any
 * adapter layer.
 */
export type CompatibilityResult<T> = {
  result: T
  log: CheckResult[]
}

/**
 * Build a success-outcome `CheckResult` tagged for the compatibility suite.
 * Use from inside a fix function when it has actually applied a change.
 *
 * @param fixId  short kebab-case id, e.g. `wrap-bare-presentation`
 * @param message  human-readable summary of what the fix did
 */
export const compatibilityCheckResult = (
  fixId: string,
  message: string
): CheckResult => ({
  check: `compatibility.${fixId}`,
  suite: 'compatibility',
  outcome: { status: 'success', message },
  timestamp: new Date().toISOString(),
  fatal: false
})
