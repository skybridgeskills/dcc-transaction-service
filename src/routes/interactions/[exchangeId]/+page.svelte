<script lang="ts">
	import InteractionPage from '$lib/pages/InteractionPage.svelte'
	import type { PageData } from './$types'

	let { data }: { data: PageData } = $props()

	if (!data.exchange) {
		throw new Error('Exchange data not available')
	}
</script>

<InteractionPage exchange={data.exchange} />
