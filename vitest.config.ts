import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // vite 8 (oxc) compiles the .tsx a test imports itself — with React's automatic runtime, said
  // here explicitly so it never depends on what Next writes into tsconfig's "jsx".
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.ts'],
    // The *.int.test.ts suites do real Postgres + object-store + image work; the 5s/10s defaults
    // flake on a busy runner (a catalogue seed, a full-size print file).
    testTimeout: 20_000,
    hookTimeout: 60_000,
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
