import { HTTPException } from 'hono/http-exception'
import {
  problemDetailResponse,
  zodProblemDetails
} from '../../errors/problem-details.js'
import { verifiablePresentationSchema } from './schema.js'

/**
 * Throws `HTTPException(400)` with VC-DM problem-details when `value` is not
 * a structurally valid Verifiable Presentation. Returns `void` on success —
 * the parsed value is intentionally **discarded** so callers cannot
 * accidentally pass a Zod-normalized derivative to a cryptographic verifier.
 *
 * Why discard: `verifiablePresentationSchema` uses `JsonLdField`, which
 * widens single values into arrays (e.g. `type: 'VerifiablePresentation'`
 * → `type: ['VerifiablePresentation']`). That mutation changes the
 * canonicalized n-quads and invalidates the proof. Verifier-core must
 * receive the raw object the wallet signed.
 */
export const assertValidVerifiablePresentationStructure = (
  value: unknown
): void => {
  const result = verifiablePresentationSchema.safeParse(value)
  if (result.success) return
  throw new HTTPException(400, {
    message: 'Invalid Verifiable Presentation',
    cause: problemDetailResponse(
      'Invalid Verifiable Presentation',
      zodProblemDetails(result.error.issues, 'verifiablePresentation')
    )
  })
}
