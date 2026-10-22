# Verification result payload

This service stores the structured result of every verification under
`variables.results.default` on a verify exchange. The shape is the
[verifier-core 2.x](https://github.com/digitalcredentials/verifier-core)
result, plus the service's own claims and issuer-trust records, namespaced
under `App.VerificationResult` in this codebase. `App.CheckResult`,
`App.CredentialVerificationResult` and `App.SuiteSummary` are aliases of
verifier-core's types, not copies.

This document specifies the payload, how the `timing` knob changes it, the
issuer-trust record, the compatibility-fix log channel, and the legacy fields
that have been removed (with no shims).

---

## Top-level shape

```ts
interface VerificationResult {
  /** Overall pass/fail: `false` if any FATAL check failed, on the
   *  presentation or on any credential. Non-fatal failures are warnings. */
  verified: boolean

  /** Every check that ran on the presentation envelope. */
  presentationResults: CheckResult[]

  /** One entry per embedded credential. */
  credentialResults: CredentialVerificationResult[]

  /** Per-(phase, suite) rollup for presentation-level checks. Primary
   *  rendering surface. */
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

  /** Issuer trust, per credential. See "Issuer trust" below. */
  issuerValidation?: IssuerValidation
  claimsValidation?: { extractedClaims, requiredClaims, matched, missingClaims? }
}
```

`results[]` and `presentationResults[]` always carry **every check that ran**:
passes, skips with their reasons, failures, and "not run" rows after a fatal
check halted the rest. `summary[]` is the per-suite rollup of the same rows.
There is no folded mode and no `verbose` knob.

### `CredentialVerificationResult`

```ts
interface CredentialVerificationResult {
  /** `false` exactly when a FATAL check on this credential failed. */
  verified: boolean
  verifiableCredential: VerifiableCredential

  /** Per-(phase, suite) rollup for THIS credential. */
  summary: SuiteSummary[]

  /** Every check that ran on this credential. Lazy-expand from `summary[]`
   *  for detail. */
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
  /** Computed from the counts alone; says nothing about whether a failure
   *  was fatal. A suite whose only failure is non-fatal is `failure` or
   *  `mixed` inside a `verified: true` result — render it as a warning. */
  status: 'success' | 'failure' | 'skipped' | 'mixed'
  /** Human-readable line, e.g. `"3 of 3 checks passed"`. */
  message: string
  counts: { passed: number; failed: number; skipped: number }
  /** Id of the first check in this suite that failed fatally, if any. The
   *  only per-suite verdict there is: reserve error styling for it. */
  fatalFailureAt?: string
  timing?: TaskTiming
}
```

There is no per-suite `verified` (or `hasFailures`); the verdict is the
top-level `verified`, and `fatalFailureAt` says which suite caused it.

### `CheckResult`

```ts
interface CheckResult {
  /** Stable, dot-separated `<phase>.<suite>.<localPart>`
   *  (e.g. `"cryptographic.proof.signature"`). When `phase === suite`
   *  the duplicate segment collapses (e.g. `"recognition.profile"`).
   *  For compatibility-fix entries, the id is `compat.<fix-name>`. */
  id: string

  /** Suite id, e.g. `"proof"`; `"compat"` for compatibility-fix entries. */
  suite: string

  outcome:
    | { status: 'success'; message: string; payload?: unknown }
    | { status: 'failure'; problems: ProblemDetail[]; payload?: unknown }
    | { status: 'skipped'; reason: string }

  /** Whether this check is fatal in its suite. A fatal failure makes the
   *  containing `verified` false; a non-fatal one is a warning. */
  fatal?: boolean

  /** Whether a fatal failure here halted later checks (absent: it did). */
  halts?: boolean

  /** Per-check timing data; only present when the producing call ran
   *  with `timing: true`. */
  timing?: TaskTiming
}
```

`payload` is data meant for code — read it rather than parsing `message`.
The issuer registry check (`trust.registry.issuer`) is the one this service
reads; see "Issuer trust".

### Problem types

`ProblemDetail` is verifier-core's RFC 9457-style structure:
`{ type: string; title: string; detail: string; instance?: string }`. This
service passes every `ProblemDetail` through to the stored result, the API and
the UI unchanged; it maps none of them. The list of problem types — including
the 2.0 additions such as `CREDENTIAL_EXPIRED`, `CREDENTIAL_NOT_YET_VALID`,
`DID_WEB_UNRESOLVED`, `REGISTRY_UNCHECKED` and the Open Badges
`OB_DECLARED_SCHEMA_*` types — is verifier-core's, and is not copied here:
see [verifier-core's problem types at `v2.0.0-beta.1`](https://github.com/digitalcredentials/verifier-core/blob/v2.0.0-beta.1/README.md#problem-types).

An expired or not-yet-valid credential is reported with its own problem type
rather than as a bad signature, and is still `verified: false`.

---

## Issuer trust (`issuerValidation`)

```ts
interface IssuerValidation {
  /** The exchange's `requireTrustedIssuer` (absent is `false`). */
  requireTrustedIssuer: boolean
  /** The exchange's allowlist of issuer ids. */
  trustedIssuers: string[]
  /** Registry names consulted: the exchange's `trustedRegistries`, else
   *  the deployment default. Empty when none was consulted. */
  consultedRegistries: string[]
  credentials: Array<{
    /** Index into `credentialResults`. */
    index: number
    /** The credential's issuer id; absent when it names none. */
    issuer?: string
    onAllowlist: boolean
    /** Registries listing the issuer, with what the REGISTRY calls it. */
    registryMatches: Array<{ registry: string; entityName?: string; entityUrl?: string }>
    /** Consulted registries that could not be checked. */
    uncheckedRegistries: string[]
    /** `onAllowlist || registryMatches.length > 0` */
    trusted: boolean
  }>
}
```

It is present when the exchange set `trustedIssuers` or `requireTrustedIssuer`,
or when any credential's registry lookup ran (so a lookup against the
deployment's default registries still reaches callers).

⚠️ **An untrusted issuer is a warning unless the exchange opts in.** Most
issuers are listed in no registry this service can reach, so by default an
issuer that is not on the allowlist and matched no registry is reported here —
and shown as a warning on the credential in the UI — and the exchange state is
unchanged. Only `variables.requireTrustedIssuer: true` makes it `invalid`, and
then "some registries could not be checked" is not trust either.
`trustedRegistries` only chooses which registries are asked; it never gates.

`registryMatches` and `uncheckedRegistries` come from the
`RegistryCheckPayload` on the `trust.registry.issuer` outcome. A lookup that
failed outright (verifier-core's `REGISTRY_ERROR`, which carries no payload)
lists every consulted registry as unchecked. The async Open Badges pass
re-runs the registry check, and the record is rebuilt from its results.

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

`variables.options` is `.strict()`: an unknown key — including the removed
`verbose` — is refused with `400`.

---

## Rendering

Walk `credentialResults[i].summary` (or the top-level `summary` for VP-level
checks) and lazy-expand into `results[]` filtered by id prefix. The UI shows a
suite's failures and its `<suite>.applies` skip by default, and every row when
the viewer ticks "Show all checks" — a display choice held in the page, never
sent to the service.

---

## Compatibility log (`compatLog`)

Some pre-canonical credentials need light per-object normalization
(envelope wrapping, `Ed25519Signature2020` context injection) before
verifier-core can verify them. Each fix that runs emits a synthetic
`CheckResult` into `compatLog` with id `compat.<fix-name>` and
`suite: 'compat'`:

```jsonc
{
  "id": "compat.vcalm-participation-message.wrap-bare-presentation",
  "suite": "compat",
  "outcome": { "status": "success", "message": "Wrapped bare VP into VCALM message envelope." },
  "fatal": false
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

`pnpm transaction verify <profile>` accepts the `timing` flag on every
workflow; it maps onto `variables.options.timing`:

```bash
pnpm transaction verify ob3            # every check that ran, no timing
pnpm transaction verify ob3 -t         # timing: populate TaskTiming everywhere
pnpm transaction verify ob3 --timing
```

The flag is accepted on every workflow command for symmetry, but only
affects the `verify` workflow today. `-v` / `--verbose` were removed with
verifier-core 2.0.

---

## Migration from earlier shapes

Fields removed in this service with no compatibility shims:

| Old field | Replacement |
| --------- | ----------- |
| `VerificationResult.allResults` | `presentationResults` + `credentialResults[i].results`, which carry every check that ran. For the small subset historically used as a debug side-channel, see `compatLog`. |
| `variables.options.verbose` / CLI `-v` | Removed; refused with `400`. Every check that ran is always returned. |
| `CheckResult.check` (e.g. `"compatibility.add-one"`) | `CheckResult.id` (e.g. `"compat.add-one"`), required. |
| `CheckResult.timestamp` | Removed. Use `CheckResult.timing` (only present when `timing: true`) for wall-clock data. |
| `SuiteSummary.verified` / `hasFailures` | Removed. Use the top-level `verified`, and `fatalFailureAt` for which suite failed fatally. |
| `issuerValidation.{ trustedRegistries, issuerFound, registryMatch }` | The per-credential `issuerValidation.credentials[]` record above. |
| Per-`CheckResult` rendering loop | Walk `summary[]`; lazy-expand into `results[]` for detail. |

If you maintain a downstream consumer that read any of those legacy
fields, update it to the new equivalents above before deploying.
