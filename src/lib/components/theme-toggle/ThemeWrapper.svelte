<script lang="ts">
	import ThemeToggle from './ThemeToggle.svelte'

	interface Props {
		theme: 'light' | 'dark' | 'system'
		storageKey?: string
	}

	let { theme, storageKey }: Props = $props()

	// Set localStorage synchronously before ThemeToggle's onMount runs
	// Script block runs before onMount, so this should work
	if (typeof window !== 'undefined') {
		localStorage.setItem(storageKey || 'theme', theme)
	}
</script>

<ThemeToggle {storageKey} />
