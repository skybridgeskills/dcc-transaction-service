<script lang="ts">
	import {
		detectCredentialType,
		getCredentialDisplayName
	} from '../../credentials/credential-type-utils.js'
	import OpenBadge from '../../credentials/open-badge/OpenBadge.svelte'
	import { Badge } from '$lib/components/ui/badge/index.js'
	import { Card, CardContent } from '$lib/components/ui/card/index.js'

	interface Props {
		/** The credential data (may be a string JSON or object) */
		credential: unknown
	}

	let { credential }: Props = $props()

	const credentialType = $derived(detectCredentialType(credential))
	const displayName = $derived(getCredentialDisplayName(credential))
</script>

<div class="flex w-full flex-col gap-4" data-testid="credential-preview">
	<Badge
		class="w-fit bg-muted text-muted-foreground"
		data-testid="credential-type-tag"
		variant="secondary"
	>
		{displayName}
	</Badge>

	{#if credentialType === 'OpenBadgeCredential' || credentialType === 'AchievementCredential'}
		<OpenBadge {credential} />
	{:else if credentialType === 'Unknown'}
		<Card
			class="border-dashed p-6 text-center"
			data-testid="unsupported-credential"
		>
			<CardContent class="p-0">
				<p class="m-0 text-sm text-muted-foreground">
					Unsupported credential type. This credential cannot be displayed.
				</p>
			</CardContent>
		</Card>
	{/if}
</div>
