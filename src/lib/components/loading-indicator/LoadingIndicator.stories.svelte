<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, waitFor } from 'storybook/test'

	import LoadingIndicator from './LoadingIndicator.svelte'

	const { Story } = defineMeta({
		title: 'Components/LoadingIndicator',
		tags: ['autodocs'],
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
		args: {}
	})
</script>

<Story
	name="Default"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Indicator should appear after delay
		await waitFor(
			() => {
				const indicator = canvas.getByRole('status', { name: /loading/i })
				expect(indicator).toBeInTheDocument()
			},
			{ timeout: 500 }
		)
	}}
>
	<LoadingIndicator loading={true} delay={250} />
</Story>

<Story
	name="NotLoading"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Indicator should not appear when not loading
		const indicator = canvas.queryByRole('status', { name: /loading/i })
		expect(indicator).not.toBeInTheDocument()
	}}
>
	<LoadingIndicator loading={false} delay={250} />
</Story>

<Story
	name="CustomDelay"
	play={async ({ canvasElement }) => {
		const canvas = within(canvasElement)
		// Should not appear immediately
		await new Promise((resolve) => setTimeout(resolve, 100))
		let indicator = canvas.queryByRole('status', { name: /loading/i })
		expect(indicator).not.toBeInTheDocument()

		// Should appear after custom delay
		await waitFor(
			() => {
				indicator = canvas.getByRole('status', { name: /loading/i })
				expect(indicator).toBeInTheDocument()
			},
			{ timeout: 600 }
		)
	}}
>
	<LoadingIndicator loading={true} delay={500} />
</Story>

<Story
	name="LoadingThenStopped"
	play={async ({ canvasElement, args }) => {
		const canvas = within(canvasElement)
		// Wait for indicator to appear
		await waitFor(
			() => {
				const indicator = canvas.getByRole('status', { name: /loading/i })
				expect(indicator).toBeInTheDocument()
			},
			{ timeout: 300 }
		)

		// Stop loading
		args.loading = false
		await new Promise((resolve) => setTimeout(resolve, 50))

		// Indicator should disappear
		const indicator = canvas.queryByRole('status', { name: /loading/i })
		expect(indicator).not.toBeInTheDocument()
	}}
>
	<LoadingIndicator loading={true} delay={100} />
</Story>
