import { randomBytes } from 'crypto'

/**
 * Generate a random pre-authorized code
 * @returns A random base64url-encoded string suitable for use as a pre-authorized code
 */
export function generatePreAuthorizedCode(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Generate a random authorization code
 * @returns A random base64url-encoded string suitable for use as an authorization code
 */
export function generateAuthorizationCode(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Generate a random access token
 * @returns A random base64url-encoded string suitable for use as an access token
 */
export function generateAccessToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Generate a random challenge nonce for proof of possession
 * @returns A random base64url-encoded string suitable for use as a c_nonce
 */
export function generateCNonce(): string {
  return randomBytes(16).toString('base64url')
}

/**
 * Generate credential offer URL for an exchange
 * @param exchangeHost The exchange host URL
 * @param workflowId The workflow ID
 * @param exchangeId The exchange ID
 * @returns The credential offer URL
 */
export function generateCredentialOfferUrl(
  exchangeHost: string,
  workflowId: string,
  exchangeId: string
): string {
  return `${exchangeHost}/workflows/${workflowId}/exchanges/${exchangeId}/openid/credential-offer`
}

/**
 * Generate openid-credential-offer deep link URL
 * @param credentialOfferUri The credential offer URI
 * @returns The deep link URL
 */
export function generateDeepLinkUrl(credentialOfferUri: string): string {
  return `openid-credential-offer://?credential_offer_uri=${encodeURIComponent(credentialOfferUri)}`
}

/**
 * Calculate token expiration time (default: 1 hour)
 * @param ttlSeconds Optional TTL in seconds (default: 3600)
 * @returns ISO timestamp string
 */
export function calculateTokenExpiration(ttlSeconds: number = 3600): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString()
}
