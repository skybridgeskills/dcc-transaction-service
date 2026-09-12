/**
 * Cryptosuites this service ADVERTISES on the VPR (sender capability).
 *
 * Every entry here must have a verifying suite in
 * `verifier-crypto-suites.ts` — that is the invariant. `ecdsa-rdfc-2019` was
 * once listed here and backed by nothing, so a wallet that signed with it
 * earned a failure for our gap; it is backed now.
 *
 * `ecdsa-sd-2023` is verifiable but deliberately NOT listed: advertising it
 * invites every wallet to derive a selective-disclosure proof, which would
 * silently change what every exchange observes. ⚠️ **There is no way to extend
 * that invitation, and there must not be one** — no per-exchange knob, profile
 * field or request parameter unions a suite into the advertised set
 * (`docs/adr/2026-09-10-advertised-acceptance-equals-actual.md`). This list is
 * the whole of what this service claims to accept.
 */
export const VERIFIABLE_CRYPTOSUITES = [
  { cryptosuite: 'eddsa-rdfc-2022' },
  { cryptosuite: 'ecdsa-rdfc-2019' },
  { cryptosuite: 'ed25519-signature-2020' }
] as const
