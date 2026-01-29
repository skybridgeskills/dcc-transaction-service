<script lang="ts" module>
	import { defineMeta } from '@storybook/addon-svelte-csf'
	import { expect, within, waitFor, userEvent } from 'storybook/test'

	import ThemeToggle from './ThemeToggle.svelte'
	import ThemeWrapper from './ThemeWrapper.svelte'

	const { Story } = defineMeta({
		title: 'Components/ThemeToggle',
		component: ThemeToggle,
	})
</script>

<!-- Default story - uses system/default theme -->
<Story name="Default" asChild>
	<ThemeToggle />
</Story>

<!-- Light theme initial state -->
<Story name="Initial: Light" asChild>
	<ThemeWrapper theme="light" storageKey="theme-test-light" />
</Story>

<!-- Dark theme initial state -->
<Story name="Initial: Dark" asChild>
	<ThemeWrapper theme="dark" storageKey="theme-test-dark" />
</Story>

<!-- Interactive test -->
<Story
	name="Interactive: Toggle behavior"
	play={async ({ canvasElement }: { canvasElement: HTMLElement }) => {
		// Clear sandboxed localStorage first to start fresh
		if (typeof window !== 'undefined') {
			localStorage.setItem('theme-test-interactive', 'light')
		}

		const canvas = within(canvasElement)
		
		// Wait for button to be available
		const button = await waitFor(
			() => canvas.getByRole('button', { name: /toggle theme/i }),
			{ timeout: 1000 }
		)

		// Verify initial state - should show moon icon (light theme)
		// Moon icon has path with "M12 3a6 6 0 0 0 9 9"
		const moonIcon = canvasElement.querySelector('svg path[d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"]')
		expect(moonIcon).toBeInTheDocument()

		// Click button to toggle to dark theme
		await userEvent.click(button)

		// Wait for icon to change to sun icon
		await waitFor(
			() => {
				const sunIcon = canvasElement.querySelector('svg circle[cx="12"]')
				expect(sunIcon).toBeInTheDocument()
			},
			{ timeout: 1000 }
		)

		// Verify dark class is applied to document
		expect(document.documentElement.classList.contains('dark')).toBe(true)

		// Click again to toggle back to light theme
		await userEvent.click(button)

		// Verify we're back to light theme (moon icon)
		await waitFor(
			() => {
				const moonIconAgain = canvasElement.querySelector('svg path[d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"]')
				expect(moonIconAgain).toBeInTheDocument()
			},
			{ timeout: 1000 }
		)

		// Verify dark class is removed
		expect(document.documentElement.classList.contains('dark')).toBe(false)
	}}
	asChild
>
	<ThemeWrapper theme="light" storageKey="theme-test-interactive" />
</Story>
