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
  eslintConfigPrettier
]
