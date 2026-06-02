import { randomBytes } from 'node:crypto'

/**
 * Generate a base64url-encoded random pre-authorized code per
 * OID4VCI 1.0 §4.1.1 (`pre-authorized_code`). 32 bytes of entropy
 * is comfortably above the 128-bit floor recommended for tokens
 * intended to be unguessable.
 */
export const generatePreAuthorizedCode = (): string =>
  randomBytes(32).toString('base64url')

/**
 * Generate an opaque base64url-encoded access token per
 * OID4VCI 1.0 §6.2 / RFC 6749 §5.1. We use 32 bytes of entropy
 * since the token grants single-credential issuance for a short
 * window.
 */
export const generateAccessToken = (): string =>
  randomBytes(32).toString('base64url')

/**
 * Generate a fresh `c_nonce` per OID4VCI 1.0 §7.2. 16 bytes is the
 * minimum the spec recommends for unpredictable challenges; the
 * value is single-use within the issued nonce's TTL.
 */
export const generateCNonce = (): string =>
  randomBytes(16).toString('base64url')
