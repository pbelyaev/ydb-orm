import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  // IMPORTANT: in flat config, `ignores` must come first to reliably exclude files
  // from earlier configs.
  {
    ignores: ['dist/**', 'node_modules/**', 'examples/**'],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // This is a library with lots of generic plumbing; `any` is sometimes a pragmatic
      // escape hatch. Keep it visible but don’t fail CI on it.
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Tests can be more permissive.
  {
    files: ['test/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
