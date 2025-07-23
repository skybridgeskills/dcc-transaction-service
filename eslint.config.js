import globals from 'globals'
import pluginJs from '@eslint/js'
import eslintConfigPrettier from 'eslint-config-prettier'

export default [
  {
    ignores: ['dist/**/*', 'node_modules/**/*', 'coverage/**/*']
  },
  {
    languageOptions: { globals: globals.node }
  },
  pluginJs.configs.recommended,
  eslintConfigPrettier
]
