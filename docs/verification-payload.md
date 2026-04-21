# Verification result payload

This service stores the structured result of every verification under
`variables.results.default` on a verify exchange. The shape is the
folded [verifier-core 2.x](https://github.com/digitalcredentials/verifier-core)
result, namespaced under `App.VerificationResult` in this codebase.

This document specifies the payload, how the `verbose` and `timing`
knobs change it, the compatibility-fix log channel, and the legacy
fields that have been removed (with no shims).

---

## Top-level shape

```ts
interface VerificationResult {
  /** Overall pass/fail; `false` if any check returned a failure outcome. */
  verified: boolean

  /** Folded checks for the presentation envelope. Failures + explicit skips
   *  by default; every check that ran when `verbose: true`. */
  presentationResults: CheckResult[]

  /** One entry per embedded credential. */
  credentialResults: CredentialVerificationResult[]

  /** Per-(phase, suite) rollup for presentation-level checks. Always
   *  populated regardless of `verbose`. Primary rendering surface. */
  summary: SuiteSummary[]

  /** Credentials that satisfied `variables.vprClaims`. */
  matchedCredentials: VerifiableCredential[]

  /** Echo of the parsed VP that was verified, when applicable. */
  verifiablePresentation?: VerifiablePresentation

  /** Inclusive top-level timing for the producing call. Only present when
   *  the call ran with `timing: true`. */
  timing?: TaskTiming

  /** `true` when the result was produced under a non-default phase filter. */
  partial?: boolean

  /** Compatibility-fix log entries. Populated only when
   *  `variables.debug === true`. See "Compatibility log" below. */
  compatLog?: CheckResult[]

  /** Optional issuer / claims validation summaries. */
  issuerValidation?: { trustedIssuers, trustedRegistries, issuerFound, registryMatch }
  claimsValidation?: { extractedClaims, requiredClaims, matched, missingClaims? }
}
```

### `CredentialVerificationResult`

```ts
interface CredentialVerificationResult {
  verified: boolean
  verifiableCredential: VerifiableCredential

  /** Per-(phase, suite) rollup for THIS credential. Always populated. */
  summary: SuiteSummary[]

  /** Folded checks; failures + explicit skips by default, all checks
   *  when `verbose: true`. Lazy-expand from `summary[]` for detail. */
  results: CheckResult[]

  /** Set by a recognizer (e.g. OBv3) when matched. */
  recognizedProfile?: string
  normalizedVerifiableCredential?: unknown

  /** Inclusive timing for this credential's verification call. */
  timing?: TaskTiming

  partial?: boolean
}
```

### `SuiteSummary`

```ts
interface SuiteSummary {
  /** Dotted id, e.g. `cryptographic.proof`. */
  id: string
  /** Phase tag — `cryptographic | trust | recognition | semantic | unknown`. */
  phase: SuiteSummaryPhase
  /** Suite id, e.g. `proof`. */
  suite: string
  /** Aggregate suite outcome. */
  status: 'success' | 'failure' | 'skipped'
  /** True iff no fatal failure within this suite. */
  verified: boolean
  /** Human-readable line, e.g. `"3 of 3 checks passed"`. */
  message: string
  counts: { passed: number; failed: number; skipped: number }
  timing?: TaskTiming
}
```

### `CheckResult`

```ts
interface CheckResult {
  /** REQUIRED. Stable, dot-separated `<phase>.<suite>.<localPart>`
   *  (e.g. `"cryptographic.proof.signature-valid"`). When `phase === suite`
   *  the duplicate segment collapses (e.g. `"recognition.profile"`).
   *  For compatibility-fix entries, the id is `compat.<fix-name>`. */
  id: string

  outcome:
    | { status: 'success'; message: string }
    | { status: 'failure'; problems: ProblemDetail[] }
    | { status: 'skipped'; reason: string }

  /** Whether this check is fatal in its suite. Fatal failures flip the
   *  containing `verified` flag to `false`; non-fatal ones are
   *  informational. */
  fatal?: boolean

  /** Per-check timing data; only present when the producing call ran
   *  with `timing: true`. */
  timing?: TaskTiming
}
```

`ProblemDetail` is the verifier-core RFC 9457-style structure:
`{ type: string; title: string; detail: string; instance?: string }`.

---

## The `verbose` knob

Set `variables.options.verbose: true` (CLI: `-v` / `--verbose`) on
the exchange request to receive every check that ran. Default is
`false`, in which case `results` and `presentationResults` carry
only entries whose outcome is `failure` or an explicit `skipped`
emitted by a suite (`<suite-id>.applies` skip-markers).

`summary[]` is unaffected by `verbose` — counts and per-suite
status reflect every check regardless of folding.

| Mode | `summary[]` | `results[]` |
| ---- | ----------- | ----------- |
| `verbose: false` (default) | every (phase, suite) | failures + explicit skips only |
| `verbose: true` | every (phase, suite) | every check that ran |

UI rendering recipe: walk `credentialResults[i].summary` (or the
top-level `summary` for VP-level checks) and lazy-expand into
`results[]` filtered by id prefix when the user clicks for detail.

---

## The `timing` knob

Set `variables.options.timing: true` (CLI: `-t` / `--timing`) to
have `TaskTiming` populated at every level:

```ts
interface TaskTiming {
  /** Inclusive start, ISO 8601 with milliseconds. */
  startedAt: string
  /** Inclusive end. */
  endedAt: string
  /** `endedAt - startedAt` in ms; convenience field for UI. */
  durationMs: number
}
```

Timing positions:

- `result.timing` — wall clock for the whole `verifyPresentation` call.
- `result.credentialResults[i].timing` — wall clock per credential.
- `result.summary[s].timing` — per-suite (sum of its checks).
- `result.credentialResults[i].summary[s].timing` — per-suite, per-cred.
- `result.presentationResults[c].timing` /
  `result.credentialResults[i].results[c].timing` — per-check.

The UI's timing panel mounts iff any of these is present, so
results produced without `timing: true` never render an empty
timing UI.

---

## Compatibility log (`compatLog`)

Some pre-canonical credentials need light per-object normalization
(envelope wrapping, `Ed25519Signature2020` context injection) before
verifier-core can verify them. Each fix that runs emits a synthetic
`CheckResult` into `compatLog` with id `compat.<fix-name>`:

```jsonc
{
  "id": "compat.vcalm-participation-message.wrap-bare-presentation",
  "outcome": { "status": "success", "message": "Wrapped bare VP into VCALM message envelope." }
}
```

`compatLog` is exposed only when `variables.debug === true`. With
`debug: false` (the default) compat fixes still run, but the log is
silently dropped from the persisted result.

`compatLog` is conceptually distinct from verifier-core's own
`presentationResults` / `credentialResults[i].results` — it
documents pre-verifier transforms, not check outcomes. Consumers
can identify compat entries by the `compat.` id prefix.

---

## CLI usage

`pnpm transaction verify <profile>` accepts the `verbose` and
`timing` flags universally; they map onto `variables.options.*`:

```bash
pnpm transaction verify ob3            # default (folded results, no timing)
pnpm transaction verify ob3 -v         # verbose: every check that ran
pnpm transaction verify ob3 -t         # timing: populate TaskTiming everywhere
pnpm transaction verify ob3 -v -t      # both
pnpm transaction verify ob3 --verbose --timing
```

Both flags are accepted on every workflow command for symmetry, but
they only affect the `verify` workflow today.

---

## Migration from the pre-v2 shape

The pre-v2 verifier-core shape included several fields that have been
removed in this service with no compatibility shims (a "hard cut" —
`rg "allResults" src/` returns zero matches; `App.CheckResult.id`
is required; the `check` / `suite` / `timestamp` fields are gone).

| Old field | Replacement |
| --------- | ----------- |
| `VerificationResult.allResults` | `presentationResults` + `credentialResults[i].results` (folded by default; opt into full list with `verbose: true`). For the small subset historically used as a debug side-channel, see `compatLog`. |
| `CheckResult.check` (e.g. `"compatibility.add-one"`) | `CheckResult.id` (e.g. `"compat.add-one"`), required. |
| `CheckResult.suite` (e.g. `"compatibility"`) | Encoded into the id's first segment (`compat.*`, `cryptographic.*`, `trust.*`, `recognition.*`, `semantic.*`). |
| `CheckResult.timestamp` | Removed. Use `CheckResult.timing` (only present when `timing: true`) for wall-clock data. |
| Per-`CheckResult` rendering loop | Walk `summary[]`; lazy-expand into `results[]` for failure detail. |

If you maintain a downstream consumer that read any of those legacy
fields, update it to the new equivalents above before deploying.
