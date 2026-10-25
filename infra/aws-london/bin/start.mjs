/**
 * The app image's entry point (copied to /app/infra/start.mjs). Loads the app's settings from the
 * secrets FILE mounted at /run/secrets/app.env — never from container environment variables,
 * which Docker keeps in the container's config on the box's disk (and in any snapshot of it).
 * The file comes from SSM via bin/fetch-env.sh and lives only in memory (/run, tmpfs).
 *
 *   node infra/start.mjs                    → next start (the app)
 *   node infra/start.mjs infra/migrate.mjs  → run that script with the same settings
 *
 * File format: KEY=value per line, taken literally (no quotes or $ expansion), # comments.
 * With SNICKERDOODLE_REQUIRE_SECRETS=1 (set by compose and deploy.sh) a missing file is fatal.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const FILE = process.env.SNICKERDOODLE_SECRETS_FILE || '/run/secrets/app.env';

/** Parse the settings file. Exported for the test; never puts a value in an error. */
export function parseSettings(text) {
  const out = {};
  text.split('\n').forEach((raw, i) => {
    const line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    const eq = line.indexOf('=');
    const key = eq > 0 ? line.slice(0, eq) : '';
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`settings file: line ${i + 1} has no valid NAME=`);
    out[key] = line.slice(eq + 1);
  });
  return out;
}

// Settings that only take effect when node starts — they belong in compose, never in the file.
const START_ONLY = new Set(['NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS']);

async function main() {
  if (existsSync(FILE)) {
    for (const [k, v] of Object.entries(parseSettings(readFileSync(FILE, 'utf8')))) {
      if (!START_ONLY.has(k)) process.env[k] = v;
    }
  } else if (process.env.SNICKERDOODLE_REQUIRE_SECRETS === '1') {
    console.error(`[start] the settings file ${FILE} is missing — refusing to start without settings`);
    process.exit(1);
  }

  const target = process.argv[2];
  if (target) {
    process.argv.splice(2, 1);
    await import(pathToFileURL(path.resolve(target)).href);
  } else {
    const nextBin = path.resolve('node_modules/next/dist/bin/next');
    process.argv = [process.argv[0], nextBin, 'start'];
    await import(pathToFileURL(nextBin).href);
  }
}

// run only when executed (`node infra/start.mjs`), not when the test imports parseSettings
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
