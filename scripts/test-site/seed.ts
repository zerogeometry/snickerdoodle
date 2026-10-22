/**
 * Seeds the TEST SITE's database from THIS computer: the migrations, the catalogue (seedCatalogue), then the
 * mockup templates (seedMockups — it needs the Prodigi blanks staged in `.prodigi-assets/`, which
 * only live here). Netlify's job endpoints time out on this much work, so it runs locally against
 * the test site's own settings in `.env.test-site`.
 *
 * Safety:
 *   - refuses unless `.env.test-site` says SITE_MODE=test (never the real shop);
 *   - never prints a setting — any error text is scrubbed of every value from the file.
 *
 * Run it through the wrapper (it sets the flags this needs):
 *   & .\scripts\test-site\seed.ps1                 # migrations, catalogue, then mockups
 *   & .\scripts\test-site\seed.ps1 -Only migrate
 *   & .\scripts\test-site\seed.ps1 -Only catalogue
 *   & .\scripts\test-site\seed.ps1 -Only mockups
 * or directly, from the repo root:
 *   NODE_OPTIONS=--conditions=react-server node node_modules/tsx/dist/cli.mjs scripts/test-site/seed.ts [migrate|catalogue|mockups]
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnvFile, redactor, refusalReason } from './seed-env';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENV_FILE = path.join(root, '.env.test-site');

async function main(): Promise<number> {
  const only = (process.argv[2] ?? '').toLowerCase();
  if (only && only !== 'migrate' && only !== 'catalogue' && only !== 'mockups') {
    console.error('usage: seed.ts [migrate|catalogue|mockups]   (no argument = all three, in that order)');
    return 2;
  }
  if (!existsSync(ENV_FILE)) {
    console.error('.env.test-site not found — make it with: node scripts/test-site-env.mjs https://your-site.netlify.app');
    return 1;
  }
  const settings = parseEnvFile(readFileSync(ENV_FILE, 'utf8'));
  const refusal = refusalReason(settings);
  if (refusal) {
    console.error(`not seeding: ${refusal}`);
    return 1;
  }
  const scrub = redactor(settings);

  // The test site's settings win over anything in this shell (e.g. a local DATABASE_URL).
  Object.assign(process.env, settings);
  process.chdir(root); // the mockup seeder reads .prodigi-assets/ relative to the repo root

  try {
    // Imported only now, so nothing reads the environment before the test site's settings are in.
    const { getDb } = await import('@/db/client');
    const db = getDb();
    if (!only || only === 'migrate') {
      // The database first: new tables the new code needs (e.g. rate_limits) must exist BEFORE it's
      // deployed. Idempotent — already-applied migrations are skipped.
      const t0 = Date.now();
      console.log('updating the database (migrations)…');
      const { migrate } = await import('drizzle-orm/postgres-js/migrator');
      await migrate(db, { migrationsFolder: path.join(root, 'src', 'db', 'migrations') });
      console.log(`database up to date (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    if (!only || only === 'catalogue') {
      const t0 = Date.now();
      console.log('seeding the catalogue…');
      const { seedCatalogue } = await import('@/server/catalogue');
      const res = await seedCatalogue(db);
      console.log(`catalogue: ${res.products} products, ${res.variants} variants (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    }
    if (!only || only === 'mockups') {
      const t0 = Date.now();
      console.log('authoring the mockups (this takes a few minutes)…');
      const { seedMockups } = await import('@/server/print/seedMockups');
      const res = await seedMockups(db);
      console.log(`mockups: ${res.authored} templates + ${res.authoredViews} extra views (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
      if (res.skippedProducts.length) {
        const keys = [...new Set(res.skippedProducts.map((x) => x.split(' (')[0]))];
        console.log(`no mockup photo yet (the shop keeps the plain tile): ${keys.join(', ')}`);
        const missing = res.skippedProducts.filter((x) => x.includes('blank not staged'));
        if (missing.length) {
          console.log(`${missing.length} blank photo(s) not found under .prodigi-assets/blanks/${process.env.SEED_VERBOSE ? ':' : ' (set SEED_VERBOSE=1 to list them)'}`);
          if (process.env.SEED_VERBOSE) for (const m of missing) console.log(`  - ${m}`);
        }
      }
    }
    console.log('done ✓');
    return 0;
  } catch (err) {
    // A failed query's message is the whole SQL + params; the useful part is its first line and
    // the underlying cause (e.g. "connect ECONNREFUSED", "password authentication failed").
    const e = err instanceof Error ? err : new Error(String(err));
    const cause = e.cause instanceof Error ? ` — ${e.cause.message}` : '';
    console.error(`seeding failed: ${scrub(e.message.split('\n')[0]!.slice(0, 200) + cause)}`);
    return 1;
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    // last resort: never echo a raw error (it could carry a connection string)
    console.error('seeding failed:', err instanceof Error ? err.name : 'unknown error');
    process.exit(1);
  },
);
