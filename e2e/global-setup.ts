import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/**
 * CI only (or E2E_SEED=1): make sure the database the server under test reads has a catalogue and
 * a mockup template for every live variant (synthetic, drawn — see e2e/seed.ts). A fresh CI
 * database has neither, and the founder's photoreal templates come from `.prodigi-assets/`, which
 * is never in git. Locally the seed does NOT run by default, so a missing template on a real
 * environment still shows up in storefront-smoke instead of being papered over.
 *
 * Runs the seed through tsx with the react-server condition (so `server-only` resolves), the same
 * way scripts/test-site/seed.ts runs. The seed refuses a non-local database.
 */
export default function globalSetup() {
  if (!process.env.CI && process.env.E2E_SEED !== '1') return;
  if (!process.env.DATABASE_URL) {
    console.warn('e2e: DATABASE_URL is not set — skipping the seed (the DB-backed journeys will skip too)');
    return;
  }
  execFileSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'e2e/seed.ts'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --conditions=react-server`.trim(),
      S3_KMS_KEY_ALIAS: 'snickerdoodle-local',
      S3_KMS_KEY_ALIAS_ORIGINALS: 'snickerdoodle-local',
    },
  });
}
