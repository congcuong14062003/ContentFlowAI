import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import vue from 'eslint-plugin-vue';
import vueParser from 'vue-eslint-parser';
import globals from 'globals';

export default [
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**', '.local/**'] },
  js.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.ts', '**/*.vue'],
    languageOptions: { parser, parserOptions: { sourceType: 'module' }, globals: { ...globals.node, ...globals.browser } },
    plugins: { '@typescript-eslint': ts },
    rules: {
      ...ts.configs.recommended.rules,
      'no-unused-vars': 'off',
      'no-undef': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error'
    }
  },
  { files: ['**/*.vue'], languageOptions: { parser: vueParser, parserOptions: { parser, extraFileExtensions: ['.vue'] } } },
  { files: ['**/*.mjs'], languageOptions: { globals: globals.node } },
  { files: ['scripts/test-browser.mjs'], languageOptions: { globals: { ...globals.node, ...globals.browser } } }
];
