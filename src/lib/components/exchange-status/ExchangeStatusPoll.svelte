<script lang="ts">
	import type { ExchangeService } from '../../services/exchange-service.js'
	import LoadingIndicator from '../loading-indicator/LoadingIndicator.svelte'
	import ErrorDisplay from '../error-display/ErrorDisplay.svelte'

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

<div class="exchange-status-poll">
	{#if error}
		<ErrorDisplay {error} />
	{:else if exchange}
		<div class="status-info">
			<div class="status-badge status-{exchange.state}">
				Status: {exchange.state}
			</div>
			<div class="poll-count">
				Checks: {statusCheckCount} / {maxPolls}
			</div>
		</div>

		{#if isPaused}
			<div class="paused-state">
				<p>Polling paused after {maxPolls} checks.</p>
				<button type="button" onclick={resumePolling} class="resume-button">
					▶ Resume Polling
				</button>
			</div>
		{:else if exchange.state === 'complete'}
			<div class="complete-message">✓ Exchange completed successfully</div>
		{:else if exchange.state === 'invalid'}
			<ErrorDisplay exchangeState="invalid" />
		{/if}
	{/if}

	{#if isPolling}
		<LoadingIndicator loading={true} delay={0} />
	{/if}
</div>

<style>
	.exchange-status-poll {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		padding: 1rem;
	}

	.status-info {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.status-badge {
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.status-pending {
		background-color: #fef3c7;
		color: #92400e;
	}

	.status-active {
		background-color: #dbeafe;
		color: #1e40af;
	}

	.status-complete {
		background-color: #d1fae5;
		color: #065f46;
	}

	.status-invalid {
		background-color: #fee2e2;
		color: #991b1b;
	}

	.poll-count {
		font-size: 0.875rem;
		color: #6b7280;
	}

	.paused-state {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		background-color: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 0.375rem;
	}

	.paused-state p {
		margin: 0;
		font-size: 0.875rem;
		color: #6b7280;
	}

	.resume-button {
		align-self: flex-start;
		padding: 0.5rem 1rem;
		background-color: #3b82f6;
		color: white;
		border: none;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background-color 0.2s;
	}

	.resume-button:hover {
		background-color: #2563eb;
	}

	.complete-message {
		padding: 0.75rem;
		background-color: #d1fae5;
		color: #065f46;
		border-radius: 0.375rem;
		font-size: 0.875rem;
		font-weight: 500;
	}
</style>
