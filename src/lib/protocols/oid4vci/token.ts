import type { OID4VCI } from './types.js'
import { generateAccessToken, generateCNonce } from './utils.js'
import { HTTPException } from 'hono/http-exception'

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
    throw new HTTPException(400, {
      message: 'Invalid pre-authorized code'
    })
  }

  if (storedCode.code !== preAuthorizedCode) {
    throw new HTTPException(400, {
      message: 'Invalid pre-authorized code'
    })
  }

  if (storedCode.used) {
    throw new HTTPException(400, {
      message: 'Pre-authorized code has already been used'
    })
  }

  if (new Date(storedCode.expiresAt) < new Date()) {
    throw new HTTPException(400, {
      message: 'Pre-authorized code has expired'
    })
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
    throw new HTTPException(400, {
      message: 'Invalid authorization code'
    })
  }

  if (storedCode.code !== authorizationCode) {
    throw new HTTPException(400, {
      message: 'Invalid authorization code'
    })
  }

  if (storedCode.used) {
    throw new HTTPException(400, {
      message: 'Authorization code has already been used'
    })
  }

  if (new Date(storedCode.expiresAt) < new Date()) {
    throw new HTTPException(400, {
      message: 'Authorization code has expired'
    })
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
