/**
 * The parts of a Verifiable Presentation Request that a protocol profile
 * states, built in one place because two workflows emit them and they must not
 * be able to disagree.
 *
 * `getDIDAuthVPR` (claim, didAuth) and `getVerifyVPR` (verify) produce VPRs
 * that differ structurally — one carries a single query object, the other an
 * array — but they share `interact.service` and `domain`, and today they
 * differ on **both** of those in ways nobody has explained. That is precisely
 * why the values are stated in a profile rather than left as two literals in
 * two files.
 *
 * ⚠️ **Order at every call site: explicit knob → active profile → the
 * historical default.** The knob outranks the profile during the migration,
 * because a profile that outranked it would silently change what an in-flight
 * exchange emits. See `protocol-profiles/for-exchange.ts`.
 *
 * ⚠️ **The historical defaults live at the call sites, and are stated a second
 * time in the authored profiles.** That duplication is deliberate and
 * temporary: the golden fixtures prove the two agree, and the knob retirement
 * removes the call-site half. Do not "fix" it by deleting either side now — the
 * defaults are what a deployment with no profile configured emits, which is
 * every deployment today.
 */
import type {
  VprInteractServiceType,
  WorkflowWireProfile
} from '../protocol-profiles/types.js'

/** One `interact.service` entry. `CredentialHandlerService` carries no endpoint. */
export type VprInteractService =
  | { type: VprInteractServiceType; serviceEndpoint: string }
  | { type: 'CredentialHandlerService' }

/**
 * Build `interact.service`, in the order the profile states.
 *
 * Order is a wire fact, not presentation: a wallet that takes the first entry
 * it recognises reaches a different endpoint depending on it.
 */
export const vprInteractServices = (
  wire: WorkflowWireProfile | undefined,
  serviceEndpoint: string,
  historicalDefault: VprInteractServiceType[]
): VprInteractService[] =>
  (wire?.vpr?.interactServices ?? historicalDefault).map((type) =>
    type === 'CredentialHandlerService'
      ? { type }
      : { type, serviceEndpoint }
  )

/**
 * The whole `interact` member, or nothing.
 *
 * ⚠️ **An empty service list omits `interact` entirely rather than emitting
 * `{ service: [] }`.** Some verifiers omit the member, and "absent" and
 * "present but empty" are different documents to a strict parser — which is the
 * class of difference this field exists to express. Emitting the empty husk
 * would be testing a third shape nobody has ever observed.
 */
export const vprInteract = (
  services: VprInteractService[]
): { interact?: { service: VprInteractService[] } } =>
  services.length > 0 ? { interact: { service: services } } : {}

/**
 * Build `domain`.
 *
 * ⚠️ **The two forms in production today are a live, unexplained differential**
 * — `didAuth` emits the bare exchange host and `verify` the full per-exchange
 * service endpoint. Reproduce them; do not converge them here. Changing which
 * form a workflow emits is a deliberate wire change: a record made before it
 * and one made after are not comparable.
 */
export const vprDomain = (
  wire: WorkflowWireProfile | undefined,
  { exchangeHost, serviceEndpoint }: { exchangeHost: string; serviceEndpoint: string },
  historicalDefault: 'exchange-host' | 'service-endpoint'
): string =>
  (wire?.vpr?.domainForm ?? historicalDefault) === 'exchange-host'
    ? exchangeHost
    : serviceEndpoint

/**
 * Spell one `acceptedMethods` entry.
 *
 * ⚠️ The VP Request specification takes the bare method NAME (`key`), never the
 * DID scheme-plus-method (`did:key`). The prefixed form is an earlier spelling
 * this service emitted; a wallet comparing against the bare name matched
 * nothing and refused before signing, and its refusal was our defect. The form
 * is a stated profile field so that cannot quietly happen again.
 */
export const vprAcceptedMethods = (
  wire: WorkflowWireProfile | undefined,
  historicalDefault: { form: 'bare-name' | 'did-prefixed'; methods: string[] }
): Array<{ method: string }> => {
  const form = wire?.vpr?.acceptedMethodsForm ?? historicalDefault.form
  const methods = wire?.vpr?.acceptedMethods ?? historicalDefault.methods
  return methods.map((method) => ({
    method: form === 'did-prefixed' ? `did:${method}` : method
  }))
}
