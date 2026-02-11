import type { OID4VCI } from './types.js'
import { HttpError } from '../../http-error.js'
import { generateAccessToken, generateCNonce } from './utils.js'

/**
 * Generate token response for pre-authorized code grant
 * @param preAuthorizedCode The pre-authorized code
 * @param storedCode The stored code data from exchange state
 * @returns Token response with access token and c_nonce
 */
export function generateTokenForPreAuthorizedCode(
  preAuthorizedCode: string,
  storedCode: OID4VCI.StoredCode | undefined
): OID4VCI.TokenResponse {
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

  // Generate access token and c_nonce
  const accessToken = generateAccessToken()
  const cNonce = generateCNonce()
  const expiresIn = 3600 // 1 hour in seconds
  const cNonceExpiresIn = 300 // 5 minutes in seconds

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    c_nonce: cNonce,
    c_nonce_expires_in: cNonceExpiresIn
  }
}

/**
 * Generate token response for authorization code grant
 * @param authorizationCode The authorization code
 * @param storedCode The stored authorization code data from exchange state
 * @returns Token response with access token and c_nonce
 */
export function generateTokenForAuthorizationCode(
  authorizationCode: string,
  storedCode: OID4VCI.StoredCode | undefined
): OID4VCI.TokenResponse {
  // Validate authorization code
  if (!storedCode) {
    throw new HttpError(400, 'Invalid authorization code')
  }

  if (storedCode.code !== authorizationCode) {
    throw new HttpError(400, 'Invalid authorization code')
  }

  if (storedCode.used) {
    throw new HttpError(400, 'Authorization code has already been used')
  }

  if (new Date(storedCode.expiresAt) < new Date()) {
    throw new HttpError(400, 'Authorization code has expired')
  }

  // Generate access token and c_nonce
  const accessToken = generateAccessToken()
  const cNonce = generateCNonce()
  const expiresIn = 3600 // 1 hour in seconds
  const cNonceExpiresIn = 300 // 5 minutes in seconds

  return {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: expiresIn,
    c_nonce: cNonce,
    c_nonce_expires_in: cNonceExpiresIn
  }
}
