import { compatFlagEnabled } from '../apply.js'
import { compatibilityCheckResult, type CompatibilityResult } from '../types.js'

const ENV_FLAG = 'COMPAT_WRAP_BARE_PRESENTATION'
const DEFAULT_ENABLED = true

const FIX_ID = 'vcalm-participation-message:wrap-bare-presentation'

/**
 * Some wallets POST a bare verifiable presentation as the request body
 * instead of wrapping it in `{ verifiablePresentation: VP }` per the VC-API
 * convention. Detect a bare VP (top-level `@context` present, no
 * `verifiablePresentation` field) and wrap it so downstream code sees a
 * uniform participation-message envelope shape.
 *
 * Envelope-only change — the inner VP and its cryptographic proof are not
 * modified, so signatures are unaffected.
 */
export const wrapBarePresentation = (
  body: Record<string, unknown>,
  options: { enabled?: boolean } = {}
): CompatibilityResult<Record<string, unknown>> => {
  const enabled =
    options.enabled ?? compatFlagEnabled(ENV_FLAG, DEFAULT_ENABLED)
  if (!enabled) return { result: body, log: [] }

  // Already wrapped — leave alone.
  if (body.verifiablePresentation !== undefined) {
    return { result: body, log: [] }
  }

  // No top-level @context — not a recognizable VP, don't speculatively wrap.
  if (body['@context'] === undefined) {
    return { result: body, log: [] }
  }

  return {
    result: { verifiablePresentation: body },
    log: [
      compatibilityCheckResult(
        FIX_ID,
        'Wrapped bare verifiable presentation in { verifiablePresentation } envelope.'
      )
    ]
  }
}
