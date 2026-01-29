<script lang="ts">
	import { onMount } from 'svelte';

	import './layout.css';
	import { ThemeToggle } from '$lib/components/theme-toggle/index.js';

	let { children } = $props();

	// Initialize theme before page renders to prevent flash
	onMount(() => {
		if (typeof window === 'undefined') return;

		const theme = localStorage.getItem('theme') || 'system';
		const html = document.documentElement;

		if (theme === 'system') {
			const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
				? 'dark'
				: 'light';
			if (systemTheme === 'dark') {
				html.classList.add('dark');
			} else {
				html.classList.remove('dark');
			}
		} else if (theme === 'dark') {
			html.classList.add('dark');
		} else {
			html.classList.remove('dark');
		}
	});
</script>

<svelte:head>
	<script>
		// Prevent flash of unstyled content by setting theme immediately
		(function () {
			const theme = localStorage.getItem('theme') || 'system';
			const html = document.documentElement;
			if (theme === 'system') {
				const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
					? 'dark'
					: 'light';
				if (systemTheme === 'dark') {
					html.classList.add('dark');
				}
			} else if (theme === 'dark') {
				html.classList.add('dark');
			}
		})();
	</script>
</svelte:head>

<div class="min-h-screen bg-background">
	<header class="border-b">
		<div class="container mx-auto flex h-16 items-center justify-between px-4">
			<h1 class="text-xl font-semibold">Transaction Service</h1>
			<ThemeToggle />
		</div>
	</header>
	<main>
		{@render children()}
	</main>
</div>
