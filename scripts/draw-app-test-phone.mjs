#!/usr/bin/env node
/**
 * A throwaway linked "Snickerdoodle Draw phone" in the LOCAL database, for running the app's own
 * end-to-end test against a website on this computer (draw-app/src/services/__tests__/website-e2e.test.ts):
 * a made-up grown-up, their family, one little one, and a key as the link flow stores it (only its hash).
 *
 *   node scripts/draw-app-test-phone.mjs            → prints DRAW_E2E_KEY and DRAW_E2E_CHILD
 *   node scripts/draw-app-test-phone.mjs --remove   → deletes every test phone this script made (and what they kept)
 *
 * LOCAL ONLY: it refuses any database that isn't on this computer. No real family, no real child.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import postgres from 'postgres';

if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}
const url = process.env.DATABASE_URL ?? '';
if (!/@(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//.test(url)) {
  console.error('draw-app-test-phone: DATABASE_URL must be a database on this computer (localhost). Nothing was changed.');
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
const MARK = 'draw-e2e-phone-';

try {
  if (process.argv.includes('--remove')) {
    const accounts = await sql`select id from accounts where email like ${`${MARK}%@example.test`}`;
    for (const { id } of accounts) {
      const families = await sql`select id from families where owner_account_id = ${id}`;
      for (const f of families) {
        await sql`delete from app_checkout_grants where family_id = ${f.id}`;
        await sql`delete from app_tokens where family_id = ${f.id}`;
        await sql`delete from storage_objects where asset_id in (select id from assets where family_id = ${f.id})`;
        await sql`delete from assets where family_id = ${f.id}`;
        await sql`delete from children where family_id = ${f.id}`;
        await sql`delete from memberships where family_id = ${f.id}`;
        await sql`delete from families where id = ${f.id}`;
      }
      await sql`delete from accounts where id = ${id}`;
    }
    console.log(`removed ${accounts.length} test phone(s)`);
  } else {
    const email = `${MARK}${Date.now().toString(36)}${randomBytes(2).toString('hex')}@example.test`;
    const [account] = await sql`insert into accounts (email, display_name, email_verified_at) values (${email}, 'Test grown-up', now()) returning id`;
    const [family] = await sql`insert into families (display_name, owner_account_id) values ('The Test Phones', ${account.id}) returning id`;
    await sql`insert into memberships (family_id, account_id, relationship, circle, access_level, status, is_owner) values (${family.id}, ${account.id}, 'PARENT', 'FAMILY', 'CONTRIBUTE', 'ACTIVE', true)`;
    const [child] = await sql`insert into children (family_id, first_name, controller_account_id) values (${family.id}, 'Olive', ${account.id}) returning id`;
    const key = `sdd_${randomBytes(32).toString('base64url')}`;
    await sql`insert into app_tokens (token_hash, account_id, family_id, device_label, sync_chosen_at) values (${createHash('sha256').update(key, 'utf8').digest('hex')}, ${account.id}, ${family.id}, 'a test phone', now())`;
    console.log(`DRAW_E2E_KEY=${key}`);
    console.log(`DRAW_E2E_CHILD=${child.id}`);
  }
} finally {
  await sql.end();
}
