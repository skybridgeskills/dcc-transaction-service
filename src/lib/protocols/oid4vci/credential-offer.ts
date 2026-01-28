import type { OID4VCI } from './types.js'
import {
  generatePreAuthorizedCode,
  generateCredentialOfferUrl
} from './utils.js'

/**
 * Extract credential types from a VC template
 * @param vcTemplate JSON string of VC template
 * @returns Array of credential types (excluding 'VerifiableCredential')
 */
function extractCredentialTypes(vcTemplate: string): string[] {
  try {
    const vc = JSON.parse(vcTemplate)
    const types = Array.isArray(vc.type) ? vc.type : [vc.type]
    // Filter out 'VerifiableCredential' as it's implicit
    return types.filter((t: string) => t !== 'VerifiableCredential')
  } catch {
    // If parsing fails, return empty array
    return []
  }
}

/**
 * Generate a credential offer for an exchange
 * @param exchange The claim exchange
 * @param config App configuration
 * @param workflow The workflow definition
 * @param preAuthorizedCode Optional pre-authorized code (will be generated if not provided)
 * @returns Credential offer object
 */
export function generateCredentialOffer(
  exchange: App.ExchangeDetailClaim,
  config: App.Config,
  workflow: App.Workflow,
  preAuthorizedCode?: string
): OID4VCI.CredentialOffer {
  // Generate pre-authorized code if not provided
  const code = preAuthorizedCode || generatePreAuthorizedCode()

  // Extract credential types from VC template
  const credentialTypes = extractCredentialTypes(exchange.variables.vc)

  // Generate credential offer URL
  const credentialOfferUri = generateCredentialOfferUrl(
    exchange.variables.exchangeHost,
    exchange.workflowId,
    exchange.exchangeId
  )

  // Use exchange host as credential issuer identifier
  const credentialIssuer = exchange.variables.exchangeHost

  // Build credential offer
  const offer: OID4VCI.CredentialOffer = {
    credential_offer_uri: credentialOfferUri,
    credential_issuer: credentialIssuer,
    credentials: [
      {
        format: 'ldp_vc', // Default format (LDP Verifiable Credential)
        types:
          credentialTypes.length > 0
            ? ['VerifiableCredential', ...credentialTypes]
            : ['VerifiableCredential']
      }
    ],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': code,
        user_pin_required: false
      }
    }
  }

  return offer
}
