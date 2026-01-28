/**
 * OID4VCI Type Definitions
 * Based on OpenID for Verifiable Credential Issuance (OID4VCI) 1.0 specification
 */

export namespace OID4VCI {
  /**
   * Credential Offer object
   * See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-offer-parameter
   */
  export interface CredentialOffer {
    credential_offer_uri?: string
    credential_issuer: string
    credentials: Array<{
      format: string
      types: string[]
      [key: string]: unknown
    }>
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code'?: {
        'pre-authorized_code': string
        user_pin_required?: boolean
      }
      'authorization_code'?: {
        issuer_state?: string
      }
    }
  }

  /**
   * Authorization Response
   * See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-authorization-response
   */
  export interface AuthorizationResponse {
    code?: string
    state?: string
    [key: string]: unknown
  }

  /**
   * Token Request
   * See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-token-request
   */
  export interface TokenRequest {
    grant_type: 'authorization_code' | 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
    code?: string
    'pre-authorized_code'?: string
    redirect_uri?: string
    code_verifier?: string
  }

  /**
   * Token Response
   * See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-token-response
   */
  export interface TokenResponse {
    access_token: string
    token_type: 'Bearer'
    expires_in?: number
    c_nonce?: string
    c_nonce_expires_in?: number
  }

  /**
   * Credential Request
   * See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-request
   */
  export interface CredentialRequest {
    format: string
    types: string[]
    proof?: {
      proof_type: string
      jwt?: string
      cwt?: string
      [key: string]: unknown
    }
    [key: string]: unknown
  }

  /**
   * Credential Response
   * See: https://openid.net/specs/openid-4-verifiable-credential-issuance-1_0.html#name-credential-response
   */
  export interface CredentialResponse {
    credential?: unknown
    format?: string
    transaction_id?: string
    c_nonce?: string
    c_nonce_expires_in?: number
  }

  /**
   * Stored token data in exchange state
   */
  export interface StoredToken {
    exchangeId: string
    accessToken: string
    expiresAt: string
    cNonce?: string
    cNonceExpiresAt?: string
  }

  /**
   * Stored authorization/pre-authorized code data
   */
  export interface StoredCode {
    code: string
    expiresAt: string
    used: boolean
  }
}
