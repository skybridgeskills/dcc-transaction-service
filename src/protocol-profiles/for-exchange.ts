/**
 * The migration-time bridge: what wire profile, if any, is active for an
 * exchange right now.
 *
 * ## Why this is separate from `resolveProtocolProfile`
 *
 * `resolveProtocolProfile` throws when no layer names a profile, and it is
 * right to: a deployment that has not said what it serves cannot have its bytes
 * attributed to a name. But that is the end state. **Today the eleven
 * per-exchange knobs are still the interface**, every exchange in flight was
 * created through them, and no deployment sets `DEFAULT_PROTOCOL_PROFILE`.
 * Throwing at every mint would take the service down to enforce a rule nothing
 * has migrated to yet.
 *
 * So during the migration a profile is an **additional** source, not the only
 * one: absent, everything behaves exactly as it did. An **unknown** name still
 * throws — naming a profile that does not exist is a mistake, not an absence.
 *
 * ⚠️ **This function is transitional and its disappearance is the point.**
 * When the knobs are retired, resolution becomes mandatory and callers go back
 * to `resolveProtocolProfile`.
 *
 * ## Precedence during the migration: the knob wins
 *
 * ⚠️ **An explicitly set per-exchange knob beats the profile.** Read that
 * twice, because it is the reverse of the end state, and it is not an accident:
 *
 * - Exchanges in flight were created with `oid4vpDelivery: 'by-value'` and the
 *   like. If a profile outranked them, configuring one would silently change
 *   what an in-flight exchange emits — **the one thing this whole roadmap puts
 *   out of scope.**
 * - A profile that outranked the knobs would make the knobs dead code
 *   immediately, which is a retirement, and retirement is its own step with its
 *   own migration for the callers that use them.
 *
 * The order is therefore: **stamped value → explicit knob → profile → the
 * historical default.** Every resolver in this service reads it that way, and
 * each says so at its own site.
 */
import { getConfig } from '../config.js'
import { getProtocolProfile } from './registry.js'
import type {
  ProfiledWorkflowId,
  ProtocolProfile,
  WorkflowWireProfile
} from './types.js'

/**
 * The workflows that emit wallet-facing bytes, and therefore carry a profile
 * branch. Exported because `election.ts` asks the same question.
 */
export const PROFILED: readonly string[] = ['claim', 'didAuth', 'verify']

/**
 * Resolve the active profile, or `undefined` when no layer names one.
 *
 * ⚠️ Only the "nobody named one" case is soft. A name that is not registered
 * still throws, from `getProtocolProfile`: quietly serving a different profile
 * than the one asked for is how a run reports the wrong answer.
 */
export const tryResolveProtocolProfile = (
  exchange: Pick<App.ExchangeDetailBase, 'tenantName' | 'variables'>,
  config: App.Config = getConfig()
): ProtocolProfile | undefined => {
  const tenant = config.tenants?.[exchange.tenantName]
  const name =
    exchange.variables?.protocolProfileName ||
    tenant?.protocolProfileName ||
    config.defaultProtocolProfileName
  return name ? getProtocolProfile(name) : undefined
}

/**
 * The active profile's branch for this exchange's workflow, or `undefined`.
 *
 * `healthz` has no branch and never gets one: it mints nothing and emits no
 * wallet-facing bytes.
 */
export const wireProfileForExchange = (
  exchange: Pick<
    App.ExchangeDetailBase,
    'tenantName' | 'variables' | 'workflowId'
  >,
  config: App.Config = getConfig()
): WorkflowWireProfile | undefined => {
  if (!PROFILED.includes(exchange.workflowId)) return undefined
  const profile = tryResolveProtocolProfile(exchange, config)
  return profile?.workflows[exchange.workflowId as ProfiledWorkflowId]
}
