/**
 * Pure helpers for the per-credential verification UI.
 *
 * The recipe these helpers serve is documented in
 * `verifier-core/docs/api/verification-results.md`: render primarily
 * from `summary[]`, lazy-expand into `results[]` for failure detail.
 *
 * - {@link phaseOrder} pins the visual order of phase groups.
 * - {@link groupByPhase} buckets per-credential `SuiteSummary`s by
 *   their `phase` (`unknown` covers consumer-supplied untagged
 *   suites).
 * - {@link failureDetail} resolves the per-suite child checks for
 *   a row that the user expanded.
 * - {@link anyTiming} is the single condition the
 *   {@link TimingPanel} mounts on, so timing UI never appears
 *   accidentally when verifier-core ran without `timing: true`.
 */

import type { SuiteSummaryPhase } from '@digitalcredentials/verifier-core'

export const phaseOrder = [
  'cryptographic',
  'trust',
  'recognition',
  'semantic',
  'unknown'
] as const satisfies readonly SuiteSummaryPhase[]

export type PhaseKey = (typeof phaseOrder)[number]

export type SuitesByPhase = Record<PhaseKey, App.SuiteSummary[]>

const emptySuitesByPhase = (): SuitesByPhase => ({
  cryptographic: [],
  trust: [],
  recognition: [],
  semantic: [],
  unknown: []
})

/**
 * Bucket a credential's per-suite summaries by phase, preserving
 * within-phase ordering as emitted by verifier-core. Phases with no
 * suites get an empty array; the UI uses {@link phaseOrder} to walk
 * the buckets in canonical order.
 */
export const groupByPhase = (
  cr: App.CredentialVerificationResult
): SuitesByPhase => {
  const out = emptySuitesByPhase()
  for (const summary of cr.summary) {
    const key: PhaseKey = (phaseOrder as readonly string[]).includes(
      summary.phase
    )
      ? (summary.phase as PhaseKey)
      : 'unknown'
    out[key].push(summary)
  }
  return out
}

/**
 * True iff `summaries` is non-empty AND every entry has
 * `status === 'skipped'`. Used by `CredentialCard` to suppress
 * phase blocks (header + rows) when there's nothing actionable to
 * show — e.g. the `recognition` phase when no recognizer matched.
 *
 * The empty-array case returns `false` deliberately: there's no
 * phase to "hide" if there are no summaries in it. `groupByPhase`
 * already produces empty buckets that callers filter via
 * `length > 0`; this predicate is purely about the all-skipped
 * case.
 */
export const isPhaseAllSkipped = (
  summaries: App.SuiteSummary[]
): boolean =>
  summaries.length > 0 && summaries.every((s) => s.status === 'skipped')

/**
 * Return the `CheckResult`s on `cr.results` that belong to
 * `summary` — i.e. whose dotted `id` is `summary.id` itself or one
 * of its children.
 *
 * Matches both the suite-row id (e.g. `cryptographic.proof`) and
 * any child check (`cryptographic.proof.signature-valid`). The
 * `summary.id + '.'` test alone would miss child-less rows
 * verifier-core emits for one-check suites.
 */
export const failureDetail = (
  cr: App.CredentialVerificationResult,
  summary: App.SuiteSummary
): App.CheckResult[] => {
  const exact = summary.id
  const prefix = `${summary.id}.`
  return cr.results.filter((r) => r.id === exact || r.id.startsWith(prefix))
}

/**
 * True iff any timing data is present anywhere in `result` —
 * top-level, per-credential, per-suite, or per-check. Drives the
 * mount condition for {@link TimingPanel}, so we never render an
 * empty timing UI for results produced without `timing: true`.
 */
export const anyTiming = (result: App.VerificationResult): boolean => {
  if (result.timing) return true
  for (const cr of result.credentialResults) {
    if (cr.timing) return true
    for (const s of cr.summary) if (s.timing) return true
    for (const r of cr.results) if (r.timing) return true
  }
  for (const r of result.presentationResults) if (r.timing) return true
  for (const s of result.summary) if (s.timing) return true
  return false
}
