import globals from 'globals'
import pluginJs from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: [
      'dist/**/*',
      'node_modules/**/*',
      'coverage/**/*',
      '.svelte-kit/**/*',
      'build/**/*'
    ]
  },
  {
    languageOptions: { globals: globals.node }
  },
  pluginJs.configs.recommended,
  eslintConfigPrettier,
  {
    // Disable naming convention rule for shadcn-svelte components
    files: ['src/lib/components/ui/**/*.svelte'],
    rules: {
      '@typescript-eslint/naming-convention': 'off'
    }
  }
]
