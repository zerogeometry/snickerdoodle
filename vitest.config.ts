import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Next's tsconfig keeps JSX as-is ("preserve") for its own compiler; vite 8 (oxc) must compile the
  // .tsx a test imports itself, with React's automatic runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    include: ['src/**/*.test.ts'],
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
