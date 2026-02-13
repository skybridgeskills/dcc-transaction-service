import type { StorybookConfig } from '@storybook/sveltekit'

const config: StorybookConfig = {
  stories: [
    '../src/lib/components/**/*.stories.@(js|ts|svelte)',
    '../src/lib/pages/**/*.stories.@(js|ts|svelte)'
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
    const { resolve } = await import('path')
    const { createRequire } = await import('module')

    const require = createRequire(import.meta.url)

    // Helper to resolve package main entry
    function resolvePackageMain(packageName: string) {
      try {
        const packageJsonPath = require.resolve(`${packageName}/package.json`)
        const packageJson = require(packageJsonPath)
        const mainEntry = packageJson.main || 'index.js'
        const packageDir = resolve(packageJsonPath, '..')
        return resolve(packageDir, mainEntry)
      } catch {
        // Fallback to node_modules path
        return resolve(process.cwd(), `node_modules/${packageName}/js/index.js`)
      }
    }

    return mergeConfig(config, {
      resolve: {
        alias: {
          // TODO: this is a
          '@digitalcredentials/dcc-context': resolvePackageMain(
            '@digitalcredentials/dcc-context'
          ),
          '@digitalcredentials/open-badges-context': resolvePackageMain(
            '@digitalcredentials/open-badges-context'
          )
        }
      },
      optimizeDeps: {
        exclude: [
          // '@digitalcredentials/open-badges-context',
          // '@digitalcredentials/dcc-context',
          '@digitalcredentials/vc',
          '@digitalcredentials/security-document-loader'
        ]
      },
      build: {
        rollupOptions: {
          external: (id) => {
            // Mark server-only packages as external for Storybook builds
            if (
              id === '@keyv/serialize' ||
              id.startsWith('@keyv/') ||
              id === 'keyv' ||
              id === 'keyv-file'
            ) {
              return true
            }
            // Mark Node.js built-ins as external for Storybook builds
            const nodeBuiltins = [
              'crypto',
              'buffer',
              'stream',
              'util',
              'fs',
              'path',
              'os',
              'net',
              'http',
              'https',
              'url',
              'zlib',
              'events',
              'child_process'
            ]
            if (nodeBuiltins.includes(id) || id.startsWith('node:')) {
              return true
            }
            return false
          }
        }
      }
    })
  }
}

export default config
