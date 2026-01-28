/**
 * Frontend-safe VPR (Verifiable Presentation Request) generation functions
 * These functions generate VPR objects without any backend dependencies
 */

import {
	named
	// @ts-ignore
} from '@digitalbazaar/credentials-context'

// Extract context URLs from the named Map using short names
const CONTEXT_URL_V1 =
	named.get('v1')?.id || 'https://www.w3.org/2018/credentials/v1'
const CONTEXT_URL_V2 =
	named.get('v2')?.id || 'https://www.w3.org/ns/credentials/v2'

/**
 * Helper function to generate credential query for VPR
 */
const getCredentialQuery = ({
	vprContext,
	vprCredentialType,
	trustedIssuers,
	vprClaims
}: {
	vprContext: string[]
	vprCredentialType: string[]
	trustedIssuers: string[]
	vprClaims: App.DcqlClaim[]
}) => {
	const credentialQuery = {
		example: {
			'@context': vprContext,
			type: vprCredentialType
		}
	}
	// We don't yet support trusted issuers or specific claims yet
	// because the query by example spec is very underspecified
	return credentialQuery
}

/**
 * This returns the authentication vpr as described in
 * https://w3c-ccg.github.io/vp-request-spec/#did-authentication
 */
export const getDIDAuthVPR = (exchange: App.ExchangeDetailBase) => {
	const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

	return {
		query: {
			type: 'DIDAuthentication'
		},
		interact: {
			service: [
				{
					type: 'VerifiableCredentialApiExchangeService',
					serviceEndpoint
				},
				{
					type: 'UnmediatedPresentationService2021',
					serviceEndpoint
				},
				{
					type: 'CredentialHandlerService'
				}
			]
		},
		challenge: exchange.variables.challenge,
		domain: exchange.variables.exchangeHost
	}
}

/**
 * Generate a Verifiable Presentation Request for verification workflow
 */
export const getVerifyVPR = (exchange: App.ExchangeDetailVerify) => {
	const { vprContext, vprCredentialType, trustedIssuers, vprClaims } =
		exchange.variables
	const serviceEndpoint = `${exchange.variables.exchangeHost}/workflows/${exchange.workflowId}/exchanges/${exchange.exchangeId}`

	const specificContexts = vprContext.filter(
		(c) => ![CONTEXT_URL_V1, CONTEXT_URL_V2].includes(c)
	)

	// If no VC context is specified, we will generate a query for each major VC version.
	const credentialQueries = vprContext.some((c) =>
		[CONTEXT_URL_V1, CONTEXT_URL_V2].includes(c)
	)
		? [
				getCredentialQuery({
					vprContext,
					vprCredentialType,
					trustedIssuers,
					vprClaims
				})
			]
		: [
				// VCDM V1 credential query
				getCredentialQuery({
					vprContext: [CONTEXT_URL_V1, ...specificContexts],
					vprCredentialType,
					trustedIssuers,
					vprClaims
				}),
				// VCDM V2 credential query
				getCredentialQuery({
					vprContext: [CONTEXT_URL_V2, ...specificContexts],
					vprCredentialType,
					trustedIssuers,
					vprClaims
				})
			]

	const vpr = {
		query: [
			{
				type: 'QueryByExample',
				credentialQuery: credentialQueries
			}
		],
		interact: {
			service: [
				{
					type: 'VerifiableCredentialApiExchangeService',
					serviceEndpoint
				},
				{
					type: 'UnmediatedPresentationService2021',
					serviceEndpoint
				}
			]
		}
	}
	return vpr
}
