<script lang="ts">
	interface Props {
		/** Delay in milliseconds before showing the indicator (default: 250) */
		delay?: number
		/** Whether loading is active */
		loading?: boolean
	}

	let { delay = 250, loading = true }: Props = $props()

	let show = $state(false)
	let timeoutId: ReturnType<typeof setTimeout> | null = null

	$effect(() => {
		// Store timeoutId in closure to avoid reactivity tracking
		if(timeoutId) {
			clearTimeout(timeoutId)
			timeoutId = null
		}

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
		class="inline-flex items-center justify-center p-2"
		role="status"
		aria-live="polite"
		aria-label="Loading"
	>
		<div
			class="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-primary"
		></div>
	</div>
{/if}
