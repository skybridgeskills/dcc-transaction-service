<script lang="ts">
	import type { ExchangeService } from '../../services/exchange-service.js'
	import LoadingIndicator from '../loading-indicator/LoadingIndicator.svelte'
	import ErrorDisplay from '../error-display/ErrorDisplay.svelte'
	import { Badge } from '$lib/components/ui/badge/index.js'
	import { Button } from '$lib/components/ui/button/index.js'
	import { Card, CardContent } from '$lib/components/ui/card/index.js'

	interface Props {
		/** Exchange ID to poll */
		exchangeId: string
		/** Workflow ID */
		workflowId: App.SupportedWorkflowIds
		/** Exchange service instance (dependency injection) */
		exchangeService: ExchangeService
		/** Polling interval in milliseconds (default: 3000) */
		pollInterval?: number
		/** Maximum number of polls before pausing (default: 40) */
		maxPolls?: number
	}

	let {
		exchangeId,
		workflowId,
		exchangeService,
		pollInterval = 3000,
		maxPolls = 40
	}: Props = $props()

	let exchange = $state<App.ExchangeDetailBase | null>(null)
	let error = $state<Error | null>(null)
	let statusCheckCount = $state(0)
	let isPolling = $state(false)
	let isPaused = $state(false)
	// Non-reactive variable - doesn't need to trigger updates
	let pollingIntervalId: ReturnType<typeof setInterval> | null = null

	async function checkExchangeStatus() {
		// Don't poll if already waiting for response or paused
		if (isPolling || isPaused) {
			return
		}

		// Stop if we've reached max polls
		if (statusCheckCount >= maxPolls) {
			isPaused = true
			stopPolling()
			return
		}

		// Stop if exchange is complete or invalid
		if (exchange && (exchange.state === 'complete' || exchange.state === 'invalid')) {
			stopPolling()
			return
		}

		isPolling = true
		error = null

		try {
			const result = await exchangeService.getExchangeState(exchangeId, workflowId)
			exchange = result
			statusCheckCount++
		} catch (e) {
			error = e instanceof Error ? e : new Error(String(e))
			stopPolling()
		} finally {
			isPolling = false
		}
	}

	function startPolling() {
		if (pollingIntervalId) {
			return
		}

		// Defer initial check to avoid synchronous execution during effect
		queueMicrotask(() => {
			checkExchangeStatus()
		})

		// Set up interval
		pollingIntervalId = setInterval(() => {
			checkExchangeStatus()
		}, pollInterval)
	}

	function stopPolling() {
		if (pollingIntervalId) {
			clearInterval(pollingIntervalId)
			pollingIntervalId = null
		}
	}

	function resumePolling() {
		isPaused = false
		statusCheckCount = 0
		startPolling()
	}

	// Start polling on mount and when props change
	$effect(() => {
		// Explicitly track only props we care about (not internal state)
		exchangeId
		workflowId
		pollInterval

		// Stop any existing polling
		stopPolling()
		// Reset state when props change
		exchange = null
		error = null
		statusCheckCount = 0
		isPaused = false

		// Start new polling
		startPolling()

		return () => {
			stopPolling()
		}
	})
</script>

<div class="flex flex-col gap-4 p-4">
	{#if error}
		<ErrorDisplay {error} />
	{:else if exchange}
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
			<div class="text-sm text-muted-foreground">
				Checks: {statusCheckCount} / {maxPolls}
			</div>
		</div>

		{#if isPaused}
			<Card class="p-4">
				<div class="flex flex-col gap-2">
					<p class="m-0 text-sm text-muted-foreground">Polling paused after {maxPolls} checks.</p>
					<Button type="button" onclick={resumePolling} size="sm" class="self-start">
						▶ Resume Polling
					</Button>
				</div>
			</Card>
		{:else if exchange.state === 'complete'}
			<div class="rounded-md bg-green-100 px-3 py-2 text-sm font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
				✓ Exchange completed successfully
			</div>
		{:else if exchange.state === 'invalid'}
			<ErrorDisplay exchangeState="invalid" />
		{/if}
	{/if}

	{#if isPolling}
		<LoadingIndicator loading={true} delay={0} />
	{/if}
</div>
