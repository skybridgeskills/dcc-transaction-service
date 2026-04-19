# transaction-manager-service Changelog

## Unreleased

### Added

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
