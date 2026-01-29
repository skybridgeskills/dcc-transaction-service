<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, waitFor } from 'storybook/test'

	import LoadingIndicator from './LoadingIndicator.svelte'

	const { Story } = defineMeta({
		title: 'Components/LoadingIndicator',
		component: LoadingIndicator,
		argTypes: {
			loading: {
				control: 'boolean',
				description: 'Whether loading is active'
			},
			delay: {
				control: 'number',
				description: 'Delay in milliseconds before showing (default: 250)'
			}
		},
		args: {
			loading: true,
			delay: 250
		}
	})
</script>

<script lang="ts">
	// State for "Loading then stopped" story - uses setTimeout to stop after 1 minute
	let loadingThenStoppedState = $state(true)
	setTimeout(() => {
		loadingThenStoppedState = false
	}, 3000)
</script>

<Story name="Default" args={{ loading: true, delay: 250 }} />

<Story name="Not initially loading" args={{ loading: false, delay: 250 }} />

<Story name="Custom delay" args={{ loading: true, delay: 1500 }} />

<Story
	name="Loading then stopped"
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		const canvas = within(canvasElement)
		
		// Wait for indicator to appear
		await waitFor(
			() => {
				const indicator = canvas.getByRole('status', { name: /loading/i })
				expect(indicator).toBeInTheDocument()
			},
			{ timeout: 250 }
		)

		// Wait for indicator to disappear (setTimeout will stop loading after 1 minute)
		await waitFor(
			() => {
				const indicator = canvas.queryByRole('status', { name: /loading/i })
				expect(indicator).not.toBeInTheDocument()
			},
			{ timeout: 5000 } // Wait up to 5 seconds (2 second buffer)
		)
	}}
>
	{#snippet template()}
		<LoadingIndicator loading={loadingThenStoppedState} delay={25} />
	{/snippet}
</Story>
