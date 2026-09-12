/**
 * Resolution: which single protocol profile is active for an exchange.
 *
 * ## Exactly one, and no layering
 *
 * Three layers may name a profile — the exchange, its tenant, the app default —
 * and **the most specific layer that names one wins outright.** A layer that
 * names nothing is skipped. ⚠️ **Two named profiles are never merged.**
 *
 * That prohibition is the point of the whole surface, so it is worth stating
 * why rather than leaving it as a rule. Two profiles simultaneously active
 * means the bytes on the wire are a function of a merge, and a merge is a
 * function of what each layer happened to be at that moment. Two deployments
 * both truthfully reporting "tenant X, profile Y" then emit different bytes,
 * and the name stops being an answer to "what did we send?" — which is the one
 * question the name exists to answer.
 *
 * If you find yourself merging two named profiles, the design has gone wrong.
 *
 * ## What "merged onto base system defaults" means here
 *
 * It means the app default is the last layer, and there is nothing left to
 * merge once it has been reached — because a stored profile is TOTAL. A base
 * layer that supplied *parts* of a profile would be a partial profile by
 * another name, and would reintroduce the disagreement above through the back
 * interaction method. So the base is a whole profile that loses to any layer
 * that names one, not a set of fill-ins that survive underneath one.
 *
 * ## No fallback when nothing names a profile
 *
 * ⚠️ Resolution throws rather than picking something. A deployment that has not
 * said which profile it serves cannot have its bytes attributed to a name, and
 * a service that guesses produces a result that reports the wrong answer.
 * Better a startup-shaped failure naming the three settings than a green run
 * nobody can reproduce.
 */
import { getProtocolProfile, PROTOCOL_PROFILES } from './registry.js'
import type { ProtocolProfile } from './types.js'

/** Which layer supplied the active profile name. */
export const PROTOCOL_PROFILE_SOURCES = [
  'exchange',
  'tenant',
  'app-default'
] as const
export type ProtocolProfileSource = (typeof PROTOCOL_PROFILE_SOURCES)[number]

/**
 * The name that won, and the layer it came from.
 *
 * The source is returned rather than derived later because it is the kind of
 * fact that is cheap to record at the moment it is decided and impossible to
 * reconstruct afterwards: "the tenant default" and "the exchange asked for the
 * same thing the tenant default happens to be" are different events, and only
 * one of them changes if the tenant default changes.
 */
export interface ResolvedProtocolProfileName {
  name: string
  source: ProtocolProfileSource
}

/**
 * The layers, most specific first. Written as data so that the order is a
 * thing you can read rather than a thing you have to infer from nesting.
 */
const layers = ({
  exchange,
  tenant,
  config
}: {
  exchange?: Pick<App.ExchangeDetailBase, 'variables'>
  tenant?: Pick<App.Tenant, 'protocolProfileName'>
  config: Pick<App.Config, 'defaultProtocolProfileName'>
}): Array<{ source: ProtocolProfileSource; name: string | undefined }> => [
  { source: 'exchange', name: exchange?.variables?.protocolProfileName },
  { source: 'tenant', name: tenant?.protocolProfileName },
  { source: 'app-default', name: config.defaultProtocolProfileName }
]

/**
 * Resolve which profile NAME is active, without looking it up.
 *
 * Separate from {@link resolveProtocolProfile} because a caller that only wants
 * to record or display the election should not have to hold a registry.
 */
export const resolveProtocolProfileName = (args: {
  exchange?: Pick<App.ExchangeDetailBase, 'variables'>
  tenant?: Pick<App.Tenant, 'protocolProfileName'>
  config: Pick<App.Config, 'defaultProtocolProfileName'>
}): ResolvedProtocolProfileName => {
  for (const layer of layers(args)) {
    // An empty string is not a name. Treating `''` as "named nothing" keeps an
    // unset environment variable and an absent one behaving identically, the
    // same rule `EXCHANGE_JOURNAL_PATH` already follows.
    if (layer.name) {
      return { name: layer.name, source: layer.source }
    }
  }
  throw new Error(
    'No protocol profile is named for this exchange. Set one on the exchange (`variables.protocolProfileName`), on its tenant (`TENANT_PROFILE_<NAME>`), or service-wide (`DEFAULT_PROTOCOL_PROFILE`). This service does not guess which bytes it is supposed to emit.'
  )
}

/**
 * Resolve the single active profile for an exchange.
 *
 * @param registry injectable so a test can resolve against fixtures without
 * reaching into the service's own registry — and so nothing is tempted to
 * mutate the real one to make a test pass.
 */
export const resolveProtocolProfile = ({
  exchange,
  tenant,
  config,
  registry = PROTOCOL_PROFILES
}: {
  exchange?: Pick<App.ExchangeDetailBase, 'variables'>
  tenant?: Pick<App.Tenant, 'protocolProfileName'>
  config: Pick<App.Config, 'defaultProtocolProfileName'>
  registry?: Readonly<Record<string, ProtocolProfile>>
}): ProtocolProfile => {
  const { name } = resolveProtocolProfileName({ exchange, tenant, config })
  return getProtocolProfile(name, registry)
}
