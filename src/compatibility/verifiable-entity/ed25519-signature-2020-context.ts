import { arrayOf } from '../../utils.js'
import { compatFlagEnabled } from '../apply.js'
import { compatibilityCheckResult, type CompatibilityResult } from '../types.js'

const ENV_FLAG = 'COMPAT_ED25519_SIGNATURE_2020_CONTEXT'
const DEFAULT_ENABLED = true

const FIX_ID = 'verifiable-entity:ed25519-signature-2020-context'
const SUITE_CONTEXT_URL = 'https://w3id.org/security/suites/ed25519-2020/v1'
const SIGNATURE_TYPE = 'Ed25519Signature2020'

/**
 * Some signers (e.g. LearnCard via SpruceKit) sign verifiable entities with
 * `Ed25519Signature2020` but omit the suite context URL
 * (`https://w3id.org/security/suites/ed25519-2020/v1`) from the entity's
 * top-level `@context`, even though the proof block declares it. The Digital
 * Bazaar Ed25519Signature2020 verifier requires the URL at the top level.
 *
 * When the proof references the suite context but the entity does not, we
 * inject it at the top level. The proof block already declares the same
 * context, so canonicalization should produce equivalent nquads — but this
 * is still a mutation and is logged honestly.
 */
export const ed25519Signature2020Context = (
  entity: Record<string, unknown>,
  options: { enabled?: boolean } = {}
): CompatibilityResult<Record<string, unknown>> => {
  const enabled =
    options.enabled ?? compatFlagEnabled(ENV_FLAG, DEFAULT_ENABLED)
  if (!enabled) return { result: entity, log: [] }

  const proof = entity.proof as
    | { type?: string | string[]; '@context'?: string | string[] }
    | undefined
  if (!proof) return { result: entity, log: [] }

  const proofType = proof.type === undefined ? [] : arrayOf(proof.type)
  if (!proofType.includes(SIGNATURE_TYPE)) return { result: entity, log: [] }

  const proofContext =
    proof['@context'] === undefined ? [] : arrayOf(proof['@context'])
  if (!proofContext.includes(SUITE_CONTEXT_URL)) {
    return { result: entity, log: [] }
  }

  const entityContext =
    entity['@context'] === undefined
      ? []
      : arrayOf(entity['@context'] as string | string[])
  if (entityContext.includes(SUITE_CONTEXT_URL)) {
    return { result: entity, log: [] }
  }

  return {
    result: {
      ...entity,
      '@context': [...entityContext, SUITE_CONTEXT_URL]
    },
    log: [
      compatibilityCheckResult(
        FIX_ID,
        `Added "${SUITE_CONTEXT_URL}" to top-level @context to satisfy Ed25519Signature2020 verification.`
      )
    ]
  }
}
