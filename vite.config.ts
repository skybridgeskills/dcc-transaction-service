import tailwindcss from '@tailwindcss/vite'
import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'
import { resolve } from 'path'
import { createRequire } from 'module'

import * as dotenv from 'dotenv'
if (process.env.NODE_ENV === 'development') {
  dotenv.config()
}

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

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: process.env.PORT ? parseInt(process.env.PORT) : 4004,
    host: process.env.HOST || '0.0.0.0',
    allowedHosts: true
  },
  resolve: {
    alias: {
      '@digitalcredentials/dcc-context': resolvePackageMain(
        '@digitalcredentials/dcc-context'
      ),
      '@digitalcredentials/open-badges-context': resolvePackageMain(
        '@digitalcredentials/open-badges-context'
      )
    }
  },
  ssr: {
    // These are server-only packages - don't try to bundle them for SSR
    external: ['@keyv/serialize', 'keyv', 'keyv-file', '@keyv/redis']
  },
  build: {
    // Enable the page JS and CSS to be fully bundled in the HTML
    // Configured in svelte.config.js
    assetsInlineLimit: Infinity,

    rollupOptions: {
      external: (id) => {
        // Mark server-only packages as external for client builds
        if (
          id === '@keyv/serialize' ||
          id.startsWith('@keyv/') ||
          id === 'keyv' ||
          id === 'keyv-file'
        ) {
          return true
        }
        // Mark Node.js built-ins as external for client builds
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
