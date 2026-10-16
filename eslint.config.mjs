import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

/**
 * The tidy-code checker: Next's recommended rules (React, hooks, accessibility basics,
 * Core Web Vitals) plus TypeScript. `npm run lint`. Kept close to the defaults on purpose —
 * typecheck + the test suites do the heavy lifting; this catches the rest.
 */
const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      '.next/**',
      '.next-*/**',
      'node_modules/**',
      'test-results/**',
      'playwright-report/**',
      'public/**',
      'mockups/**',
      'proposal/**',
      'reports/**',
      'research_notes/**',
      'sample-art/**',
      'scripts/sample-art/**',
      'next-env.d.ts',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // Off on purpose: next/image's optimiser fetches the picture server-side and keeps a cached
      // copy — children's pictures are private, served only via short-lived signed URLs (CLAUDE.md).
      '@next/next/no-img-element': 'off',
      // `_`-prefixed names are deliberately unused (destructuring to drop a field, etc.)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
    },
  },
];

export default config;
