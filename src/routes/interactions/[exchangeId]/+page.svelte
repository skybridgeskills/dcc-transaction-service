<script lang="ts">
	import InteractionPage from '$lib/pages/InteractionPage.svelte'
	import type { PageData } from './$types'
	import { getApp } from '$lib/app/app-context.js'

	let { data }: { data: PageData } = $props()

	if (!data.exchange) {
		throw new Error('Exchange data not available')
	}

	// Get ExchangeService from app context
	// This works during SSR; on client hydration, getApp() will use the same context
	let exchangeService = $derived.by(() => {
		try {
			const app = getApp()
			if (!app.exchangeService) {
				throw new Error('ExchangeService not available in app context')
			}
			return app.exchangeService
		} catch (e) {
			// If getApp() fails (client-side without SSR context), throw error
			throw new Error('ExchangeService not available')
		}
	})
</script>

<InteractionPage {exchangeService} exchange={data.exchange} />
