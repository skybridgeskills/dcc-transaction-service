import globals from 'globals'
import pluginJs from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'
import svelte from 'eslint-plugin-svelte'
import ts from 'typescript-eslint'
import svelteConfig from './svelte.config.js'

export default [
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'coverage/**/*',
      '.svelte-kit/**/*',
      'build/**/*',
      'storybook-static/**/*'
    ]
  },
  {
    languageOptions: { globals: { ...globals.node, ...globals.browser } }
  },
  pluginJs.configs.recommended,
  ...svelte.configs.recommended,
  eslintConfigPrettier,
  ...svelte.configs.prettier,
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig
      }
    },
    rules: {
      // Disable no-undef for Svelte files since TypeScript already handles undefined variable checking
      // and understands global namespace declarations like App from src/app.d.ts
      'no-undef': 'off'
    }
  },
  {
    // Disable naming convention rule for shadcn-svelte components
    files: ['src/lib/components/ui/**/*.svelte'],
    rules: {
      '@typescript-eslint/naming-convention': 'off'
    }
  }
]
