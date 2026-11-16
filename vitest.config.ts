import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vite 8 (oxc) compiles the .tsx a test imports itself — with React's automatic runtime, said
  // here explicitly so it never depends on what Next writes into tsconfig's "jsx".
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.ts'],
    // next-auth's ESM imports `next/server` with no extension, which plain Node can't resolve; let vite
    // resolve it so a test can drive the real Auth.js handler (src/auth/__tests__/session.int.test.ts).
    server: { deps: { inline: ['next-auth'] } },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // `server-only` throws outside an RSC graph; stub it so server modules that import
      // it as a client-bundle guard stay unit-testable under vitest.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
});
