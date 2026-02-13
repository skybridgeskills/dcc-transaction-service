<script lang="ts">
	import LoadingIndicator from '../loading-indicator/LoadingIndicator.svelte'
	import ErrorDisplay from '../error-display/ErrorDisplay.svelte'
	import { Badge } from '$lib/components/ui/badge/index.js'
	import { Button } from '$lib/components/ui/button/index.js'

	interface Props {
		/** Exchange data */
		exchange: App.ExchangeDetailBase
		/** Callback to trigger exchange state fetch */
		onPollRequest: () => Promise<App.ExchangeDetailBase>
		/** Whether polling is currently in progress */
		isPolling?: boolean
		/** Current status check count */
		statusCheckCount?: number
		/** Whether polling is paused */
		isPaused?: boolean
		/** Maximum number of polls before pausing (default: 40) */
		maxPolls?: number
		/** Callback to resume polling */
		onResumePolling?: () => void
	}

	let {
		exchange,
		onPollRequest,
		isPolling = false,
		statusCheckCount = 0,
		isPaused = false,
		maxPolls = 40,
		onResumePolling
	}: Props = $props()

	function handleResumePolling() {
		if (onResumePolling) {
			onResumePolling()
		}
	}

	// Calculate remaining checks and fill percentage
	const remainingChecks = $derived(maxPolls - statusCheckCount)
	const fillPercentage = $derived(remainingChecks / maxPolls)

	// Determine color based on remaining checks
	// Green until 30% remaining (12 checks), then yellow
	// Threshold: 30% of maxPolls = 12 remaining checks (for default maxPolls=40)
	const statusBarColor = $derived.by(() => {
		const threshold = Math.ceil(maxPolls * 0.3) // 30% threshold
		if (remainingChecks > threshold) {
			// More than 30% remaining - green
			return 'bg-green-500 dark:bg-green-600'
		} else {
			// 30% or less remaining - yellow
			return 'bg-yellow-400 dark:bg-yellow-600'
		}
	})
</script>

<div class="flex flex-col gap-4 p-4">
	<div class="flex items-center gap-4">
		<Badge
			class={
				exchange.state === 'pending'
					? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
					: exchange.state === 'active'
						? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
						: exchange.state === 'complete'
							? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
							: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
			}
		>
			Status: {exchange.state}
		</Badge>

		{#if isPaused}
			<!-- Resume Button - inline with badge -->
			{#if onResumePolling}
				<Button type="button" onclick={handleResumePolling} size="sm">
					▶ Resume
				</Button>
			{/if}
		{:else}
			<!-- Status Bar - inline with badge -->
			<div
				class="h-3 w-[40px] overflow-hidden rounded-full border border-border bg-white dark:bg-gray-800"
				role="progressbar"
				aria-valuenow={remainingChecks}
				aria-valuemin={0}
				aria-valuemax={maxPolls}
				aria-label={`${remainingChecks} checks remaining`}
			>
				<div
					class="h-full transition-all duration-300 {statusBarColor}"
					style="width: {fillPercentage * 100}%"
				></div>
			</div>
		{/if}
	</div>

	{#if exchange.state === 'complete'}
		<div class="rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
			✓ Exchange completed successfully
		</div>
	{:else if exchange.state === 'invalid'}
		<ErrorDisplay exchangeState="invalid" />
	{/if}

	{#if isPolling}
		<LoadingIndicator loading={true} delay={0} />
	{/if}
</div>
