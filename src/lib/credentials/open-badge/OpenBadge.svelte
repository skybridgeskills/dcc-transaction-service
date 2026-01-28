<script lang="ts">
	import type { CredentialRendererProps } from '../credential-renderer.js'

	interface Props extends CredentialRendererProps {}

	let { credential }: Props = $props()

	// Parse credential if it's a string
	$: parsedCredential = (() => {
		try {
			return typeof credential === 'string' ? JSON.parse(credential) : credential
		} catch {
			return credential
		}
	})()

	// Extract badge data
	$: badgeName =
		parsedCredential?.name ||
		parsedCredential?.credentialSubject?.achievement?.name ||
		'Untitled Badge'

	$: badgeDescription =
		parsedCredential?.credentialSubject?.achievement?.description ||
		parsedCredential?.credentialSubject?.achievement?.criteria?.narrative ||
		''

	$: issuerName =
		typeof parsedCredential?.issuer === 'object'
			? parsedCredential.issuer.name || parsedCredential.issuer.id
			: parsedCredential?.issuer || 'Unknown Issuer'

	$: issuerImage =
		typeof parsedCredential?.issuer === 'object' &&
		parsedCredential.issuer.image
			? typeof parsedCredential.issuer.image === 'string'
				? parsedCredential.issuer.image
				: parsedCredential.issuer.image.id
			: null

	$: badgeImage =
		parsedCredential?.credentialSubject?.achievement?.image ||
		parsedCredential?.image ||
		null

	$: badgeImageUrl =
		badgeImage
			? typeof badgeImage === 'string'
				? badgeImage
				: badgeImage.id || badgeImage.url
			: null
</script>

<div class="open-badge" data-testid="open-badge">
	{#if badgeImageUrl}
		<div class="badge-image-container">
			<img
				src={badgeImageUrl}
				alt={badgeName}
				class="badge-image"
				data-testid="badge-image"
			/>
		</div>
	{/if}

	<div class="badge-content">
		<h3 class="badge-name" data-testid="badge-name">{badgeName}</h3>

		{#if badgeDescription}
			<p class="badge-description" data-testid="badge-description">
				{badgeDescription}
			</p>
		{/if}

		<div class="badge-issuer" data-testid="badge-issuer">
			{#if issuerImage}
				<img
					src={issuerImage}
					alt={issuerName}
					class="issuer-image"
					data-testid="issuer-image"
				/>
			{/if}
			<span class="issuer-name">{issuerName}</span>
		</div>
	</div>
</div>

<style>
	.open-badge {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1.5rem;
		border: 2px solid #e5e7eb;
		border-radius: 0.5rem;
		background: white;
		max-width: 400px;
	}

	.badge-image-container {
		display: flex;
		justify-content: center;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.badge-image {
		max-width: 150px;
		max-height: 150px;
		width: auto;
		height: auto;
		object-fit: contain;
		border-radius: 0.25rem;
	}

	.badge-content {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.badge-name {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
		line-height: 1.4;
	}

	.badge-description {
		margin: 0;
		font-size: 0.875rem;
		color: #6b7280;
		line-height: 1.5;
	}

	.badge-issuer {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
	}

	.issuer-image {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		flex-shrink: 0;
	}

	.issuer-name {
		font-size: 0.875rem;
		color: #6b7280;
		font-weight: 500;
	}
</style>
