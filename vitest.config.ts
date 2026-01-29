import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { storybookTest } from '@storybook/addon-vitest/vitest-plugin'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	test: {
		projects: [
			{
				test: {
					name: 'node',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					globals: true
				}
			},
			{
				extends: './vite.config.ts',
				plugins: [
					// The plugin will run tests for the stories defined in your Storybook config
					// See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
					storybookTest({
						configDir: path.join(__dirname, '.storybook')
					})
				],
				test: {
					name: 'storybook',
					testTimeout: 60000,
					expect: { requireAssertions: false },
					browser: {
						enabled: true,
						headless: true,
						provider: playwright(),
						instances: [
							{
								browser: 'chromium'
							}
						]
					},
					setupFiles: ['.storybook/vitest.setup.ts']
				}
			}
		]
	}
})
