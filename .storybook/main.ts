import type { StorybookConfig } from '@storybook/sveltekit'

const config: StorybookConfig = {
	stories: [
		'../src/lib/components/**/*.stories.@(js|ts|svelte)'
	],
	addons: [
		'@storybook/addon-svelte-csf',
		'@storybook/addon-a11y',
		'@storybook/addon-docs',
		'@storybook/addon-vitest'
	],
	framework: {
		name: '@storybook/sveltekit',
		options: {}
	},
	async viteFinal(config) {
		const { mergeConfig } = await import('vite')
		return mergeConfig(config, {
			optimizeDeps: {
				exclude: [
					'@digitalcredentials/open-badges-context',
					'@digitalcredentials/dcc-context',
					'@digitalcredentials/vc',
					'@digitalcredentials/security-document-loader'
				]
			}
		})
	}
}

export default config
