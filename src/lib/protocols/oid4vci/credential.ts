import type { OID4VCI } from './types.js'
import { HttpError } from '../../http-error.js'

/**
 * Validate access token
 * @param accessToken The access token to validate
 * @param storedToken The stored token data from exchange state
 * @param expectedExchangeId The exchange ID this token should belong to
 * @throws HttpError if token is invalid
 */
export function validateAccessToken(
  accessToken: string,
  storedToken: OID4VCI.StoredToken | undefined,
  expectedExchangeId: string
): void {
  if (!storedToken) {
    throw new HttpError(401, 'Invalid access token')
  }

  if (storedToken.accessToken !== accessToken) {
    throw new HttpError(401, 'Invalid access token')
  }

  if (new Date(storedToken.expiresAt) < new Date()) {
    throw new HttpError(401, 'Access token has expired')
  }

  // Validate exchangeId matches
  if (storedToken.exchangeId !== expectedExchangeId) {
    throw new HttpError(401, 'Access token does not belong to this exchange')
  }
}

/**
 * Format credential response from VC-API format to OID4VCI format
 * @param vcApiResponse The response from participateInClaimExchange (verifiable presentation)
 * @returns OID4VCI credential response
 */
export function formatCredentialResponse(
  vcApiResponse: any
): OID4VCI.CredentialResponse {
  // The VC-API response contains a verifiablePresentation with verifiableCredential array
  // OID4VCI expects the credential directly in the 'credential' field
  let credential: unknown

  if (vcApiResponse.verifiablePresentation) {
    // Handle nested verifiablePresentation structure (LCW compatibility hack)
    const vp =
      vcApiResponse.verifiablePresentation.verifiablePresentation ||
      vcApiResponse.verifiablePresentation
    if (vp.verifiableCredential && Array.isArray(vp.verifiableCredential)) {
      // Take the first credential
      credential = vp.verifiableCredential[0]
    } else if (vp.verifiableCredential) {
      credential = vp.verifiableCredential
    }
  } else if (vcApiResponse.verifiableCredential) {
    // Direct verifiableCredential
    if (Array.isArray(vcApiResponse.verifiableCredential)) {
      credential = vcApiResponse.verifiableCredential[0]
    } else {
      credential = vcApiResponse.verifiableCredential
    }
  } else {
    // Fallback: use the response itself if it looks like a credential
    credential = vcApiResponse
  }

  if (!credential) {
    throw new HttpError(500, 'Failed to extract credential from response')
  }

  return {
    credential,
    format: 'ldp_vc' // LDP Verifiable Credential format (default)
  }
}
