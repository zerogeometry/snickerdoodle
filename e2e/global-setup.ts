import { execFileSync } from 'node:child_process';

/**
 * Before any journey: make sure the database the server under test reads has a catalogue and a
 * mockup template for every live variant (synthetic, drawn — see e2e/seed.ts). Runs the seed
 * through vite-node so it uses the real server modules. The seed refuses a non-local database.
 */
export default function globalSetup() {
  if (process.env.E2E_SKIP_SEED === '1') return;
  if (!process.env.DATABASE_URL) {
    console.warn('e2e: DATABASE_URL is not set — skipping the seed (the DB-backed journeys will skip too)');
    return;
  }
  execFileSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite-node', '-c', 'vitest.config.ts', 'e2e/seed.ts'], {
    stdio: 'inherit',
    env: { ...process.env, S3_KMS_KEY_ALIAS: 'snickerdoodle-local', S3_KMS_KEY_ALIAS_ORIGINALS: 'snickerdoodle-local' },
    shell: process.platform === 'win32',
  });
}
