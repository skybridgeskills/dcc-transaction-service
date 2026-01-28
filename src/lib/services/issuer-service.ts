/**
 * IssuerService interface for signing verifiable credentials
 */

export interface SignCredentialOptions {
  /**
   * Optional issuer DID/key override
   * If not provided, uses the service's default issuer DID/key
   */
  issuerDid?: string
  issuerKeySeed?: string
}

export interface IssuerService {
  /**
   * Signs a verifiable credential
   * @param credential The credential to sign (without proof)
   * @param tenantName The tenant name for the credential
   * @param options Optional signing options
   * @returns The signed verifiable credential
   */
  signCredential(
    credential: Record<string, unknown>,
    tenantName: string,
    options?: SignCredentialOptions
  ): Promise<Record<string, unknown>>
}
