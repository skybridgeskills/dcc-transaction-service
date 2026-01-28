/**
 * VcApiIssuerService - calls external signing service HTTP endpoint
 * Used in production when SIGNING_SERVICE env var is set
 */

import { callService } from '../../utils.js'
import type { IssuerService, SignCredentialOptions } from './issuer-service.js'

export class VcApiIssuerService implements IssuerService {
  constructor(private config: App.Config) {}

  async signCredential(
    credential: Record<string, unknown>,
    tenantName: string,
    options?: SignCredentialOptions
  ): Promise<Record<string, unknown>> {
    // Call the signing service HTTP endpoint
    const endpoint = `${this.config.signingService}/instance/${tenantName}/credentials/sign`
    const signedCredential = await callService(endpoint, credential)
    return signedCredential as Record<string, unknown>
  }
}
