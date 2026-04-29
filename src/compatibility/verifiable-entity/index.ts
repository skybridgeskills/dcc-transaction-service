import { chainFixes } from '../apply.js'
import { ed25519Signature2020Context } from './ed25519-signature-2020-context.js'

/**
 * Normalize a verifiable entity (verifiable presentation or verifiable
 * credential) so downstream verifiers see a shape they expect.
 *
 * Each fix in the chain is independently feature-flagged and pure; this
 * aggregator only orders them. Any fix that touches a signed entity must
 * be safe with respect to canonicalization — the proof block's own
 * `@context` must already declare anything we add here.
 */
export const prepareVerifiableEntity = (entity: Record<string, unknown>) =>
  chainFixes(entity, ed25519Signature2020Context)
