/**
 * Credential Type Utilities
 * Provides functions for detecting credential types and generating human-readable names
 */

/**
 * Supported credential types
 */
export type CredentialType = 'OpenBadgeCredential' | 'AchievementCredential' | 'Unknown'

/**
 * Human-readable names for credential types
 */
const CREDENTIAL_TYPE_NAMES: Record<string, string> = {
	OpenBadgeCredential: 'Open Badge',
	AchievementCredential: 'Open Badge' // Alias for OpenBadgeCredential
}

/**
 * Gets the human-readable name for a credential type
 *
 * @param credentialType - The credential type identifier
 * @returns Human-readable name, or the original type if not found
 *
 * @example
 * ```ts
 * getCredentialTypeName('OpenBadgeCredential') // 'Open Badge'
 * getCredentialTypeName('AchievementCredential') // 'Open Badge'
 * getCredentialTypeName('UnknownType') // 'UnknownType'
 * ```
 */
export function getCredentialTypeName(credentialType: string): string {
	return CREDENTIAL_TYPE_NAMES[credentialType] || credentialType
}

/**
 * Detects the credential type from credential data
 *
 * @param credential - The credential object (may be a string JSON or object)
 * @returns The detected credential type
 *
 * @example
 * ```ts
 * detectCredentialType({ type: ['VerifiableCredential', 'OpenBadgeCredential'] }) // 'OpenBadgeCredential'
 * detectCredentialType({ type: ['VerifiableCredential', 'AchievementCredential'] }) // 'AchievementCredential'
 * detectCredentialType({ type: ['VerifiableCredential'] }) // 'Unknown'
 * ```
 */
export function detectCredentialType(credential: unknown): CredentialType {
	try {
		// Handle string JSON
		const parsed =
			typeof credential === 'string' ? JSON.parse(credential) : credential

		if (!parsed || typeof parsed !== 'object') {
			return 'Unknown'
		}

		const types = parsed.type

		if (!Array.isArray(types)) {
			return 'Unknown'
		}

		// Check for OpenBadgeCredential first (more specific)
		if (types.includes('OpenBadgeCredential')) {
			return 'OpenBadgeCredential'
		}

		// Check for AchievementCredential (alias)
		if (types.includes('AchievementCredential')) {
			return 'AchievementCredential'
		}

		return 'Unknown'
	} catch {
		return 'Unknown'
	}
}

/**
 * Gets the human-readable name for a credential based on its data
 *
 * @param credential - The credential object (may be a string JSON or object)
 * @returns Human-readable credential type name
 *
 * @example
 * ```ts
 * getCredentialDisplayName({ type: ['VerifiableCredential', 'OpenBadgeCredential'] }) // 'Open Badge'
 * ```
 */
export function getCredentialDisplayName(credential: unknown): string {
	const credentialType = detectCredentialType(credential)
	return getCredentialTypeName(credentialType)
}
