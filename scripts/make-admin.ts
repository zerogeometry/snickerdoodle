/**
 * Make an account an admin (or take it away). There is deliberately no button for this in the app:
 * whoever can run this against the database already controls the system.
 *
 *   npx tsx scripts/make-admin.ts you@example.com           → admin (they set up two-step login on first visit)
 *   npx tsx scripts/make-admin.ts you@example.com --remove  → not an admin, and their two-step secret wiped
 *
 * Needs DATABASE_URL (from .env locally, the secret store in production).
 */
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../src/db/schema';

(async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  const remove = process.argv.includes('--remove');
  if (!email || !email.includes('@')) {
    console.error('usage: npx tsx scripts/make-admin.ts <email> [--remove]');
    process.exit(1);
  }
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle(client, { schema });
  const rows = await db
    .update(schema.accounts)
    .set(remove ? { isAdmin: false, mfaSecret: null } : { isAdmin: true })
    .where(eq(schema.accounts.email, email))
    .returning({ id: schema.accounts.id });
  await client.end();
  if (!rows.length) {
    console.error(`no account for ${email} — sign in to the site once first, then run this again`);
    process.exit(1);
  }
  console.log(remove ? `${email} is no longer an admin` : `${email} is an admin — open /admin/review to set up two-step login`);
})();
