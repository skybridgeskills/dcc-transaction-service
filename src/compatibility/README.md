# Compatibility fixes

Each file under this directory adjusts inbound wallet payloads to work around
a specific spec interpretation, library bug, or wallet quirk. Fixes are
feature-flagged via env vars so we can disable individual fixes without
redeploying.

## Architecture

See `docs/plans/2026-04-17-compatibility-fix-architecture/00-design.md` for
the full design. In short:

- Each fix is a pure function with the signature
  `(input, options?: { enabled?: boolean }) => { result, log: CheckResult[] }`.
- Fixes are grouped by the kind of object they process (one folder per
  object type). Each folder's `index.ts` exposes a `prepare<ObjectType>`
  aggregator that chains the fixes for that object.
- Aggregators return a `CompatibilityResult`; call sites use `applyFix(...)`
  to extract the result and append the log to a shared `CheckResult[]`.
- `log` entries use `verifier-core`'s `CheckResult` shape so they merge
  cleanly into the verification log shown to operators when
  `exchange.variables.debug === true`.

## Active fixes

| Fix file                                                    | Env var                              | Default | Applies to                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------ | ------- | ---------------------------------------------------------------------------------------------------------------- |
| `vcalm-participation-message/wrap-bare-presentation.ts`     | `COMPAT_WRAP_BARE_PRESENTATION`      | enabled | Bare VPs posted as the request body — wraps in `{ verifiablePresentation }` envelope. Signature-safe (envelope only). |
| `verifiable-entity/ed25519-signature-2020-context.ts`       | `COMPAT_ED25519_SIGNATURE_2020_CONTEXT` | enabled | Ed25519Signature2020-signed entities missing the suite context at the top level — adds it to top-level `@context`. Signature-safe (proof block declares the same context). |

## Adding a new fix

1. Pick the folder for the object type the fix mutates (or create a new one
   alongside `vcalm-participation-message/` and `verifiable-entity/`).
2. Add a single-purpose file `kebab-case-fix-id.ts` exporting a function
   following the signature above.
3. Define `ENV_FLAG`, `DEFAULT_ENABLED`, and `FIX_ID` constants at the top.
   `FIX_ID` is namespaced by the object-type folder, e.g.
   `'vcalm-participation-message:wrap-bare-presentation'` — this becomes the
   `check` field on emitted log entries (`compatibility.<FIX_ID>`).
4. Add the fix to the folder's `index.ts` `chainFixes(...)` call so it runs
   in the relevant `prepare<ObjectType>` aggregator.
5. Add unit tests next to the fix file. Drive enable/disable with the
   `options.enabled` flag instead of `process.env`.
6. Update the table above.
