import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * The tidy-code checker: Next's recommended rules (React, hooks, accessibility basics,
 * Core Web Vitals) plus TypeScript. `npm run lint`. Kept close to the defaults on purpose —
 * typecheck + the test suites do the heavy lifting; this catches the rest.
 */
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
      '.claude/**', // other sessions' worktrees (and their build output) live here
    ],
  },
  // eslint-config-next 16 ships flat config natively (no FlatCompat bridge)
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Off on purpose: next/image's optimiser fetches the picture server-side and keeps a cached
      // copy — children's pictures are private, served only via short-lived signed URLs (CLAUDE.md).
      '@next/next/no-img-element': 'off',
      // `_`-prefixed names are deliberately unused (destructuring to drop a field, etc.)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true }],
      // eslint-config-next 16 newly switches on eslint-plugin-react-hooks' React Compiler readiness
      // rules. They flag ~65 existing patterns (setState in an effect, reading a ref during render,
      // Date.now() in render…) that work today — we don't run the React Compiler. Off until a
      // dedicated pass, rather than rewriting dozens of components inside a framework upgrade.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
    },
  },
];

export default config;
