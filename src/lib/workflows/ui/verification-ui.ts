/**
 * Verification workflow-specific UI content and structure
 */

import type { ExchangeDetailVerify } from '../../../app.d.ts'

export interface VerificationUIContent {
	title: string
	description: string
	credentialTypes: string[]
	claims?: Array<{
		path: string[]
		values?: string[]
	}>
	trustedIssuers?: string[]
	trustedRegistries?: string[]
}

/**
 * Extract verification-specific UI content from an exchange
 */
export function getVerificationUIContent(
	exchange: App.ExchangeDetailVerify
): VerificationUIContent {
	return {
		title: 'Present Your Credential',
		description: 'Please present a credential to verify your identity.',
		credentialTypes: exchange.variables.vprCredentialType,
		claims:
			exchange.variables.vprClaims && exchange.variables.vprClaims.length > 0
				? exchange.variables.vprClaims.map((claim) => ({
						path: claim.path,
						values: claim.values
					}))
				: undefined,
		trustedIssuers:
			exchange.variables.trustedIssuers &&
			exchange.variables.trustedIssuers.length > 0
				? exchange.variables.trustedIssuers
				: undefined,
		trustedRegistries:
			exchange.variables.trustedRegistries &&
			exchange.variables.trustedRegistries.length > 0
				? exchange.variables.trustedRegistries
				: undefined
	}
}
