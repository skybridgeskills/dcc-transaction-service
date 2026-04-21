/**
 * Re-fold a flat `CheckResult[]` into the verifier-core
 * `{ results, summaries }` shape using the same algorithm verifier-core
 * itself uses post-`runSuites`.
 *
 * Re-exported as a single chokepoint so service-side consumers never
 * accidentally hand-roll a parallel folding implementation; if
 * verifier-core ever changes its folding semantics we get the new
 * behavior for free, and a single import grep lists everywhere we
 * depend on it.
 *
 * Callers must pass the same `VerificationSuite[]` list verifier-core
 * would have used to produce these checks — `foldCheckResults` reads
 * `suite.phase` for the rollup id and `suite.checks.length` for the
 * "of N" denominator in human-readable messages.
 *
 * Important: in non-verbose mode the input `checks` carries only
 * failures and explicit `<suite>.applies` skips. Refolding such a
 * subset cannot reconstruct `counts.passed`; pre-existing per-suite
 * `summary[]` arrays should generally be merged by concatenation
 * (see `verify-task-worker.ts`'s OB merge for the canonical pattern).
 */
export {
  foldCheckResults as refoldSummary,
  type FoldOptions
} from '@digitalcredentials/verifier-core'
