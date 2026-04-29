import type { CompatibilityResult } from './types.js'

/**
 * Compose pure compatibility-fix functions left-to-right. Each fix receives
 * the value produced by the previous fix; their log entries are concatenated
 * in invocation order.
 *
 * @example
 *   const { result, log } = chainFixes(input, fixA, fixB, fixC)
 */
export const chainFixes = <T>(
  input: T,
  ...fixes: Array<(input: T) => CompatibilityResult<T>>
): CompatibilityResult<T> => {
  let result = input
  const log: App.CheckResult[] = []
  for (const fix of fixes) {
    const next = fix(result)
    result = next.result
    log.push(...next.log)
  }
  return { result, log }
}

/**
 * Drain a fix's log into the running results array and return the
 * unwrapped value. Lets call sites stay flat:
 *
 *   const presentation = applyFix(prepareVerifiableEntity(raw), results)
 *
 * The fix functions themselves remain pure; mutation is contained here.
 */
export const applyFix = <T>(
  fix: CompatibilityResult<T>,
  log: App.CheckResult[]
): T => {
  log.push(...fix.log)
  return fix.result
}

/**
 * Pure parser for compatibility-fix env values. Kept separate from
 * `compatFlagEnabled` so unit tests can exercise the truth table without
 * touching `process.env`.
 *
 * Recognized values (case-insensitive, trimmed):
 *   - `true` | `1` | `yes` → enabled
 *   - `false` | `0` | `no` → disabled
 *   - `undefined` | empty | unknown → `defaultEnabled`
 */
export const isCompatFlagEnabled = (
  raw: string | undefined,
  defaultEnabled: boolean
): boolean => {
  if (raw === undefined) return defaultEnabled
  const v = raw.trim().toLowerCase()
  if (v === '') return defaultEnabled
  if (v === 'true' || v === '1' || v === 'yes') return true
  if (v === 'false' || v === '0' || v === 'no') return false
  return defaultEnabled
}

/**
 * Thin wrapper that reads `process.env[envVar]` and delegates to
 * {@link isCompatFlagEnabled}. Used by per-fix files as the default for
 * their `enabled` option; tests should call the fix with an explicit
 * `enabled: true | false` instead of mutating env vars.
 */
export const compatFlagEnabled = (
  envVar: string,
  defaultEnabled: boolean
): boolean => isCompatFlagEnabled(process.env[envVar], defaultEnabled)
