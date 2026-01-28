<script lang="ts">
	interface Props {
		/** Delay in milliseconds before showing the indicator (default: 250) */
		delay?: number
		/** Whether loading is active */
		loading?: boolean
	}

	let { delay = 250, loading = true }: Props = $props()

	let show = $state(false)

	$effect(() => {
		// Store timeoutId in closure to avoid reactivity tracking
		let timeoutId: ReturnType<typeof setTimeout> | null = null

		// Reset show state when loading changes
		if (!loading) {
			show = false
			return
		}

		// Set timeout to show indicator after delay
		timeoutId = setTimeout(() => {
			if (loading) {
				show = true
			}
		}, delay)

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
		}
	})
</script>

{#if show && loading}
	<div
		class="loading-indicator"
		role="status"
		aria-live="polite"
		aria-label="Loading"
	>
		<div class="spinner"></div>
	</div>
{/if}

<style>
	.loading-indicator {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
	}

	.spinner {
		width: 1rem;
		height: 1rem;
		border: 2px solid #e5e7eb;
		border-top-color: #3b82f6;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
