/**
 * Future-knob seam for the Open Badges verification suites applied to
 * a single credential by the asynchronous verify-task worker.
 *
 * v1: returns `[openBadgesSuite]` unconditionally. Callers are
 * responsible for first filtering credentials with `isOpenBadgeCredential`
 * (per the v1 hard-coded policy) so that the worker only invokes this
 * resolver for credentials it actually intends to OB-verify.
 *
 * Lives behind a function so a future per-exchange knob (e.g. opt-in/out
 * of specific OB checks, tightened or relaxed achievement vocab) lands
 * in one place without rippling through the worker.
 */
import type { VerificationSuite } from '@digitalcredentials/verifier-core'
import { openBadgesSuite } from '@digitalcredentials/verifier-core/openbadges'

/**
 * Returns the Open Badges suites to apply when re-verifying
 * `_credential` in the async pass.
 *
 * @param _credential - Reserved for future per-credential decisions.
 *   v1 ignores this argument.
 */
export const openbadgesSuitesFor = (
  _credential: unknown
): VerificationSuite[] => [openBadgesSuite]
