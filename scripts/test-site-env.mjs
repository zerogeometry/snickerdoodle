/**
 * Makes `.env.test-site` — the TEST SITE's settings (Netlify + Supabase), never committed
 * (.gitignore has .env.*). Fresh secrets are generated here; the blanks are yours to fill from
 * the Supabase / Resend / Stripe dashboards. Then load them into Netlify with:
 *
 *   npx netlify env:import .env.test-site
 *
 *   node scripts/test-site-env.mjs https://your-site.netlify.app
 *
 * Refuses to overwrite an existing file (so filled-in values are never lost).
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = '.env.test-site';
if (existsSync(OUT)) {
  console.error(`${OUT} already exists — edit it, or delete it to start again`);
  process.exit(1);
}
const site = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^https:\/\/[a-z0-9.-]+$/i.test(site)) {
  console.error('usage: node scripts/test-site-env.mjs https://your-site.netlify.app');
  process.exit(1);
}
const local = existsSync('.env') ? readFileSync('.env', 'utf8') : '';
const fromLocal = (k) => (local.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1] ?? '').trim();
const secret = () => randomBytes(32).toString('base64url');
const words = ['cinnamon', 'crayon', 'doodle', 'sprinkle', 'teacup', 'button', 'marble', 'pebble', 'biscuit', 'puddle'];
const pick = () => words[randomBytes(1)[0] % words.length];
const password = `${pick()}-${pick()}-${pick()}-${100 + (randomBytes(1)[0] % 900)}`;

const stripeKey = fromLocal('STRIPE_SECRET_KEY');
const prodigiUrl = fromLocal('PRODIGI_BASE_URL');

writeFileSync(
  OUT,
  `# TEST SITE settings — never commit, never paste into chat.
SITE_MODE=test
TEST_SITE_PASSWORD=${password}
APP_URL=${site}
AUTH_URL=${site}
AUTH_SECRET=${secret()}
JOBS_SECRET=${secret()}

# Supabase (London) → Project Settings → Database → Connection string → "Transaction pooler" (port 6543)
DATABASE_URL=

# Supabase → Storage → S3 Connection: copy the endpoint, then "New access key"
S3_ENDPOINT=
S3_REGION=eu-west-2
S3_FORCE_PATH_STYLE=true
S3_BUCKET=snickerdoodle-test
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Resend (EU region) → API Keys; MAIL_FROM must be on the domain you verified there
MAIL_PROVIDER=resend
RESEND_API_KEY=
MAIL_FROM=snickerdoodle <hello@mail.snickerdoodle.co.uk>

# Stripe TEST mode only (the site refuses to start with a live key)
STRIPE_SECRET_KEY=${stripeKey.startsWith('sk_test') ? stripeKey : ''}
# Stripe (test mode) → Developers → Webhooks → add ${site}/api/webhooks/stripe → signing secret
STRIPE_WEBHOOK_SECRET=

# Prodigi SANDBOX (nothing is printed)
PRODIGI_API_KEY=${prodigiUrl.includes('sandbox') ? fromLocal('PRODIGI_API_KEY') : ''}
PRODIGI_BASE_URL=${prodigiUrl.includes('sandbox') ? prodigiUrl : 'https://api.sandbox.prodigi.com/v4.0'}
POD_MODE=SANDBOX
`,
  { mode: 0o600 },
);
console.log(`wrote ${OUT} — fill in the blanks (DATABASE_URL, S3_*, RESEND_API_KEY, STRIPE_WEBHOOK_SECRET).`);
console.log('The test-site password is in the file (TEST_SITE_PASSWORD).');
