<script lang="ts">
	import type { CredentialRendererProps } from '../credential-renderer.js'
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'

	interface Props extends CredentialRendererProps {}

	let { credential }: Props = $props()

	// Parse credential if it's a string
	const parsedCredential = $derived.by(() => {
		try {
			return typeof credential === 'string' ? JSON.parse(credential) : credential
		} catch {
			return credential
		}
	})

	// Extract badge data
	const badgeName = $derived(
		parsedCredential?.name ||
			parsedCredential?.credentialSubject?.achievement?.name ||
			'Untitled Badge'
	)

	const badgeDescription = $derived(
		parsedCredential?.credentialSubject?.achievement?.description ||
			parsedCredential?.credentialSubject?.achievement?.criteria?.narrative ||
			''
	)

	const issuerName = $derived(
		typeof parsedCredential?.issuer === 'object'
			? parsedCredential.issuer.name || parsedCredential.issuer.id
			: parsedCredential?.issuer || 'Unknown Issuer'
	)

	const issuerImage = $derived(
		typeof parsedCredential?.issuer === 'object' &&
			parsedCredential.issuer.image
			? typeof parsedCredential.issuer.image === 'string'
				? parsedCredential.issuer.image
				: parsedCredential.issuer.image.id
			: null
	)

	const badgeImage = $derived(
		parsedCredential?.credentialSubject?.achievement?.image ||
			parsedCredential?.image ||
			null
	)

	const badgeImageUrl = $derived(
		badgeImage
			? typeof badgeImage === 'string'
				? badgeImage
				: badgeImage.id || badgeImage.url
			: null
	)
</script>

<Card class="max-w-[400px]" data-testid="open-badge">
	<CardContent class="flex flex-col gap-4 p-6">
		{#if badgeImageUrl}
			<div class="mb-2 flex items-center justify-center">
				<img
					src={badgeImageUrl}
					alt={badgeName}
					class="h-auto max-h-[150px] w-auto max-w-[150px] rounded object-contain"
					data-testid="badge-image"
				/>
			</div>
		{/if}

		<div class="flex flex-col gap-3">
			<CardHeader class="p-0">
				<CardTitle class="m-0 text-xl font-semibold leading-snug text-foreground" data-testid="badge-name">
					{badgeName}
				</CardTitle>
			</CardHeader>

			{#if badgeDescription}
				<p class="m-0 text-sm leading-relaxed text-muted-foreground" data-testid="badge-description">
					{badgeDescription}
				</p>
			{/if}

			<div
				class="mt-2 flex items-center gap-2 border-t border-border pt-3"
				data-testid="badge-issuer"
			>
				{#if issuerImage}
					<img
						src={issuerImage}
						alt={issuerName}
						class="h-8 w-8 flex-shrink-0 rounded-full object-cover"
						data-testid="issuer-image"
					/>
				{/if}
				<span class="text-sm font-medium text-muted-foreground">{issuerName}</span>
			</div>
		</div>
	</CardContent>
</Card>
