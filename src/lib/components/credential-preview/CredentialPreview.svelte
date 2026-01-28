<script lang="ts">
	import {
		detectCredentialType,
		getCredentialDisplayName
	} from '../../credentials/credential-type-utils.js'
	import OpenBadge from '../../credentials/open-badge/OpenBadge.svelte'

	interface Props {
		/** The credential data (may be a string JSON or object) */
		credential: unknown
	}

	let { credential }: Props = $props()

	$: credentialType = detectCredentialType(credential)
	$: displayName = getCredentialDisplayName(credential)
</script>

<div class="credential-preview" data-testid="credential-preview">
	<div class="credential-type-tag" data-testid="credential-type-tag">
		{displayName}
	</div>

	{#if credentialType === 'OpenBadgeCredential' || credentialType === 'AchievementCredential'}
		<OpenBadge {credential} />
	{:else if credentialType === 'Unknown'}
		<div class="unsupported-credential" data-testid="unsupported-credential">
			<p class="unsupported-message">
				Unsupported credential type. This credential cannot be displayed.
			</p>
		</div>
	{/if}
</div>

<style>
	.credential-preview {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: 100%;
	}

	.credential-type-tag {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		border-radius: 0.25rem;
		background-color: #f3f4f6;
		color: #374151;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		width: fit-content;
	}

	.unsupported-credential {
		padding: 1.5rem;
		border: 2px dashed #e5e7eb;
		border-radius: 0.5rem;
		background: #f9fafb;
		text-align: center;
	}

	.unsupported-message {
		margin: 0;
		color: #6b7280;
		font-size: 0.875rem;
	}
</style>
