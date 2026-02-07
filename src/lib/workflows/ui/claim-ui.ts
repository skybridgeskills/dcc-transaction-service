/**
 * Claim workflow-specific UI content and structure
 */

import type { ExchangeDetailClaim } from '../../../app.d.ts'

export interface ClaimUIContent {
	title: string
	description: string
	credentialTemplate: string // JSON string of the VC template
}

/**
 * Extract claim-specific UI content from an exchange
 */
export function getClaimUIContent(exchange: App.ExchangeDetailClaim): ClaimUIContent {
	return {
		title: 'Claim Your Credential',
		description: 'Complete the exchange to receive your credential.',
		credentialTemplate: exchange.variables.vc
	}
}
