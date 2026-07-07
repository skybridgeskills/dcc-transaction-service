# Transaction Service Changelog

## Unreleased

### Added

- **`verifier-core` 2.x adoption.** The verify workflow now consumes
  the folded result shape (`summary: SuiteSummary[]` plus
  `results: CheckResult[]` carrying only failures + explicit skips
  by default). `App.VerificationResult.summary` and
  `App.CredentialVerificationResult.summary` are first-class
  required fields; the UI renders primarily from `summary[]` and
  lazy-expands into `results[]` for failure detail. See
  [`docs/verification-payload.md`](./docs/verification-payload.md).
- **`variables.options.verbose` knob.** Set `true` on the exchange
  request to receive every check that ran (passes included).
  Default is the verifier-core 2.x folded shape.
- **`variables.options.timing` knob.** Set `true` to populate
  `TaskTiming` on every level of the result tree (top-level,
  per-credential, per-suite, per-check). The UI's timing panel
  mounts iff timing data is present.
- **CLI `--verbose` / `-v` and `--timing` / `-t` flags** on
  `pnpm transaction verify <profile>`. Universally accepted across
  workflows, but they only affect verify today.
- **Verification UI rewrite.** Per-credential cards driven by
  `summary[]`; phase-grouped suite rows; lazy-expand to
  `FailureDetailList` on click; opt-in `TimingPanel`. Replaces the
  flat `CheckResultRow` list.

### Changed

- **`App.CheckResult.id` is required** and namespaced as
  `<phase>.<suite>.<localPart>` (or `compat.<fix-name>` for
  compatibility-log entries). `id` is the canonical key for
  filtering and grouping on the consumer side.
- **`compatLog` replaces the legacy `allResults` debug field** on
  `verifyDIDAuth`, `claimWorkflow`, and `didAuthWorkflow`. Carries
  only the synthetic compatibility-fix entries (`compat.*` id
  prefix); verifier-core's own check results are exposed via the
  standard `presentationResults` / `credentialResults` shape.

### Async Open Badges pipeline

- **Async Open Badges verification pipeline.** The verify workflow now
  splits into a synchronous default-suites pass and an asynchronous Open
  Badges pass driven by an in-process FIFO worker
  (`enqueueVerifyTask` + `processVerifyTask`). POST returns `200` once
  the sync pass commits; the OB pass continues in the background.
- **`variables.verifyTask` on verify exchanges.** New field exposes
  async-pass lifecycle (`status`, `attempt`, `deadlineAt`,
  `openBadgesCredentialIndices`, `lastError`, `attemptId`). See README
  "Verification pipeline" section.
- **GET-driven sweep.** `sweepIfTimedOut` runs on every GET against a
  verify exchange (and on `/protocols` / `/interaction`). Lapsed
  attempts are retried up to `VERIFY_TASK_MAX_ATTEMPTS`; exhausted
  attempts mark the task `'gave-up'`, transition the exchange to
  `'invalid'`, and append a synthetic `pipeline.timeout` `CheckResult`.
- **Optimistic CAS on exchange writes** via `saveExchangeWithCAS` keyed
  on `verifyTask.attemptId`, protecting against stale-worker writes
  losing to a sweep-bumped attempt.
- **Process-wide shared `Verifier`** (`src/lib/verifier.ts`) built via
  verifier-core's `createVerifier` factory so issuer DID, status list,
  and JSON-LD context caches are shared across the sync + async passes.
- **New env knobs.** `VERIFY_TASK_DEADLINE_MS` (default `60000`),
  `VERIFY_TASK_MAX_ATTEMPTS` (default `2`).

## 0.3.0 - 2024-11-25

### Changed

- added test coverage
- added health check option

## 0.2.0 - 2024-10-11

### Changed

- updated libs to support VC2

## 0.1.1 - 2023-12-11

### Changed

- added optional metadata property on stored object

## 0.1.0 - 2023-09-26

### Added

- Initial commit.
- First working MVP commit.
