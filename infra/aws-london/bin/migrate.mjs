/**
 * Applies the database migrations (src/db/migrations) — run by deploy.sh with the NEW image,
 * BEFORE the new app starts, so the tables it expects exist. Idempotent: applied migrations are
 * skipped. Uses only production dependencies (drizzle-orm's migrator + postgres), so it runs in
 * the runtime image without drizzle-kit or tsx:
 *
 *   docker run --rm --env-file /run/snickerdoodle/app.env <image> node infra/migrate.mjs
 *
 * Never prints DATABASE_URL; an error message is scrubbed of it before it is shown.
 */
import path from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[migrate] DATABASE_URL is not set');
  process.exit(1);
}
const scrub = (text) => String(text).split(url).join('•••').replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1•••@');

const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
const t0 = Date.now();
try {
  await migrate(drizzle(client), { migrationsFolder: path.join(process.cwd(), 'src', 'db', 'migrations') });
  console.log(`[migrate] database up to date (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
} catch (e) {
  console.error(`[migrate] FAILED: ${scrub(e?.message ?? e)}`);
  process.exitCode = 1;
} finally {
  await client.end({ timeout: 5 });
}
