/**
 * Credential Renderer Interface
 * Defines the base interface for credential renderers
 *
 * This interface provides a pattern for adding new credential types.
 * Each credential type should have:
 * 1. A detection function in credential-type-utils.ts
 * 2. A Svelte component for rendering (e.g., OpenBadge.svelte)
 * 3. Registration in CredentialPreview component
 *
 * @example
 * ```ts
 * // To add a new credential type:
 * // 1. Add type to CredentialType union in credential-type-utils.ts
 * // 2. Add name mapping in CREDENTIAL_TYPE_NAMES
 * // 3. Update detectCredentialType function
 * // 4. Create new component (e.g., CustomCredential.svelte)
 * // 5. Add case in CredentialPreview component
 * ```
 */

/**
 * Base interface for credential renderer props
 * All credential renderer components should accept credential data
 */
export interface CredentialRendererProps {
	/** The credential data (may be a string JSON or object) */
	credential: unknown
}

/**
 * Type guard to check if credential has a specific type
 *
 * @param credential - The credential to check
 * @param type - The credential type to check for
 * @returns True if credential matches the type
 */
export function isCredentialType(
	credential: unknown,
	type: string
): boolean {
	try {
		const parsed =
			typeof credential === 'string' ? JSON.parse(credential) : credential

		if (!parsed || typeof parsed !== 'object') {
			return false
		}

		const types = parsed.type
		return Array.isArray(types) && types.includes(type)
	} catch {
		return false
	}
}
