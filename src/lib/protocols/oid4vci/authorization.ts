import type { OID4VCI } from './types.js'
import { HttpError } from '../../http-error.js'
import { generateAuthorizationCode } from './utils.js'

/**
 * Validate and process authorization request with pre-authorized code
 * @param preAuthorizedCode The pre-authorized code from the credential offer
 * @param storedCode The stored code data from exchange state
 * @returns Authorization response with authorization code
 */
export function processAuthorization(
  preAuthorizedCode: string,
  storedCode: OID4VCI.StoredCode | undefined
): OID4VCI.AuthorizationResponse {
  // Validate pre-authorized code
  if (!storedCode) {
    throw new HttpError(400, 'Invalid pre-authorized code')
  }

  if (storedCode.code !== preAuthorizedCode) {
    throw new HttpError(400, 'Invalid pre-authorized code')
  }

  if (storedCode.used) {
    throw new HttpError(400, 'Pre-authorized code has already been used')
  }

  if (new Date(storedCode.expiresAt) < new Date()) {
    throw new HttpError(400, 'Pre-authorized code has expired')
  }

  // Generate authorization code
  const authorizationCode = generateAuthorizationCode()

  return {
    code: authorizationCode
  }
}
