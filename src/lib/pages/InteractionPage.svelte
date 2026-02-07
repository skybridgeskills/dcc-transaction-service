<script lang="ts">
	import type { ExchangeService } from '../services/exchange-service.js'
	import WalletSelector from '../components/wallet-selector/WalletSelector.svelte'
	import ExchangeStatusPoll from '../components/exchange-status/ExchangeStatusPoll.svelte'
	import CredentialPreview from '../components/credential-preview/CredentialPreview.svelte'
	import ErrorDisplay from '../components/error-display/ErrorDisplay.svelte'
	import { getVerificationUIContent } from '../workflows/ui/verification-ui.js'
	import { getClaimUIContent } from '../workflows/ui/claim-ui.js'
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card/index.js'
	import { Badge } from '$lib/components/ui/badge/index.js'

	interface Props {
		/** Exchange service instance (dependency injection) */
		exchangeService: ExchangeService
		/** Exchange data */
		exchange: App.ExchangeDetailBase
	}

	let { exchangeService, exchange }: Props = $props()

	// Parse credential template for claim workflows
	const credentialData = $derived.by(() => {
		if (exchange.workflowId === 'claim') {
			try {
				const claimExchange = exchange as App.ExchangeDetailClaim
				return JSON.parse(claimExchange.variables.vc)
			} catch {
				return null
			}
		}
		return null
	})

	// Get workflow-specific UI content
	const verificationContent = $derived.by(() => {
		if (exchange.workflowId === 'verify') {
			return getVerificationUIContent(exchange as App.ExchangeDetailVerify)
		}
		return null
	})

	const claimContent = $derived.by(() => {
		if (exchange.workflowId === 'claim') {
			return getClaimUIContent(exchange as App.ExchangeDetailClaim)
		}
		return null
	})

</script>

<div class="container mx-auto max-w-4xl px-4 py-8" data-testid="interaction-page">
	{#if verificationContent}
		<!-- Verification Workflow UI -->
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>{verificationContent.title}</CardTitle>
				<CardDescription>{verificationContent.description}</CardDescription>
			</CardHeader>
			<CardContent class="flex flex-col gap-4">
				{#if verificationContent.credentialTypes.length > 0}
					<div class="flex flex-col gap-2">
						<p class="text-sm font-medium text-foreground">Required Credential Types:</p>
						<div class="flex flex-wrap gap-2">
							{#each verificationContent.credentialTypes as type}
								<Badge variant="secondary" data-testid="credential-type-{type}">
									{type}
								</Badge>
							{/each}
						</div>
					</div>
				{/if}

				{#if verificationContent.claims && verificationContent.claims.length > 0}
					<div class="flex flex-col gap-2">
						<p class="text-sm font-medium text-foreground">Required Claims:</p>
						<ul class="list-inside list-disc text-sm text-muted-foreground">
							{#each verificationContent.claims as claim}
								<li>
									{claim.path.join('.')}
									{#if claim.values && claim.values.length > 0}
										<span class="text-muted-foreground">
											(one of: {claim.values.join(', ')})
										</span>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if verificationContent.trustedIssuers &&
					verificationContent.trustedIssuers.length > 0}
					<div class="flex flex-col gap-2">
						<p class="text-sm font-medium text-foreground">Trusted Issuers:</p>
						<ul class="list-inside list-disc text-sm text-muted-foreground">
							{#each verificationContent.trustedIssuers as issuer}
								<li>{issuer}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if verificationContent.trustedRegistries &&
					verificationContent.trustedRegistries.length > 0}
					<div class="flex flex-col gap-2">
						<p class="text-sm font-medium text-foreground">Trusted Registries:</p>
						<ul class="list-inside list-disc text-sm text-muted-foreground">
							{#each verificationContent.trustedRegistries as registry}
								<li>{registry}</li>
							{/each}
						</ul>
					</div>
				{/if}
			</CardContent>
		</Card>
	{:else if claimContent}
		<!-- Claim Workflow UI -->
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>{claimContent.title}</CardTitle>
				<CardDescription>{claimContent.description}</CardDescription>
			</CardHeader>
			<CardContent>
				{#if credentialData}
					<CredentialPreview credential={credentialData} />
				{:else}
					<div class="py-4 text-center text-sm text-muted-foreground">
						Unable to parse credential template
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}

	{#if exchange.state === 'invalid'}
		<ErrorDisplay exchangeState="invalid" />
	{:else if exchange.state === 'complete'}
		<Card class="mb-6 border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950">
			<CardContent class="p-6">
				<div class="flex items-center gap-3">
					<svg
						class="h-6 w-6 text-green-600 dark:text-green-400"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
						data-testid="success-icon"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M5 13l4 4L19 7"
						/>
					</svg>
					<div>
						<p class="m-0 font-semibold text-green-900 dark:text-green-100">
							Exchange completed successfully
						</p>
						<p class="m-0 mt-1 text-sm text-green-700 dark:text-green-300">
							Your credential has been {exchange.workflowId === 'claim'
								? 'issued'
								: 'verified'}.
						</p>
					</div>
				</div>
			</CardContent>
		</Card>
	{:else if exchange.state === 'pending' || exchange.state === 'active'}
		<!-- Wallet Selector and Status Poll -->
		<WalletSelector
			{exchangeService}
			exchangeId={exchange.exchangeId}
			workflowId={exchange.workflowId}
		/>
		<ExchangeStatusPoll
			{exchangeService}
			exchangeId={exchange.exchangeId}
			workflowId={exchange.workflowId}
		/>
	{/if}
</div>
