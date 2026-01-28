/**
 * Frontend-safe OID4VCI URL generation functions
 * These functions generate URLs without any backend dependencies
 */

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
