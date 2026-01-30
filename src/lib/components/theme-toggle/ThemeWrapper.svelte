<script lang="ts">
	import ThemeToggle from './ThemeToggle.svelte'

	interface Props {
		theme: 'light' | 'dark' | 'system'
		storageKey?: string
	}

	let { theme, storageKey }: Props = $props()

	// Set localStorage synchronously before ThemeToggle's onMount runs
	// Use $effect to reactively update localStorage when props change
	$effect(() => {
		if (typeof window !== 'undefined') {
			const key = storageKey || 'theme'
			const value = theme
			localStorage.setItem(key, value)
		}
	})
</script>

<ThemeToggle {storageKey} />
