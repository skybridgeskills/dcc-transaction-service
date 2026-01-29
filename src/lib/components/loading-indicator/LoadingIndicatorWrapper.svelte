<script lang="ts">
	import LoadingIndicator from './LoadingIndicator.svelte'

	interface Props {
		delay?: number
		initialLoading?: boolean
	}

	let { delay = 100, initialLoading = true }: Props = $props()

	// Initialize state with prop value; component manages its own state after initialization
	let loadingState = $state(false)
	$effect(() => {
		loadingState = initialLoading
	})

	function toggleLoading() {
		loadingState = !loadingState
	}
</script>

<div data-testid="loading-wrapper" class="flex items-center gap-2 bg-red-500">
	<button
		data-testid="loading-trigger"
		class="bg-blue-500"
		onclick={toggleLoading}
		
	>
		Toggle Loading
	</button>
	<LoadingIndicator loading={loadingState} {delay} />
</div>
