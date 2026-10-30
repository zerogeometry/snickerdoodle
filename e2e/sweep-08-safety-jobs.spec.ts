import { createHmac } from 'node:crypto';
import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { accountId, hasServerLog, jobsSecret, mailTo, objectKeys } from './sweep08';

/**
 * Test sweep 2026-10-29, tester 08 — CONTENT SAFETY, ADMIN, JOBS and HEALTH against the e2e
 * server (a production build: no real screening configured, so every upload is HELD for review —
 * the go-live posture until IWF + Rekognition are live). DB + bucket checked directly.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (.env)');

const JOBS = ['retention', 'reapply-erasures?since=2026-01-01T00:00:00Z', 'reminders', 'popularity', 'fulfilment', 'prodigi-sync', 'seed-catalogue', 'seed-mockups'];
const auth = () => ({ authorization: `Bearer ${jobsSecret()}` });

/** A guest uploads a drawing; returns the asset the upload made (never one an earlier call returned). */
const seen = new Set<string>();
async function guestUpload(page: Page): Promise<string> {
  const since = new Date(Date.now() - 2000);
  await quietCookies(page);
  await uploadAndOpenRange(page);
  let id = '';
  await expect
    .poll(async () => {
      const rows = await sql()`select id from assets where created_at >= ${since} and ephemeral_claim_id is not null order by created_at desc`;
      return (id = (rows.map((r) => r.id as string).find((x) => !seen.has(x)) ?? ''));
    }, { timeout: 20_000 })
    .not.toBe('');
  seen.add(id);
  // let the range finish drawing its product mockups (they are stored under the asset) — see 08-B8
  await page.waitForLoadState('networkidle');
  return id;
}

// RFC 6238 (HMAC-SHA1, 30 s, 6 digits) — what an authenticator app computes from the shown key.
function totp(b32: string, at = Date.now()): string {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const bytes: number[] = [];
  for (const ch of b32.replace(/\s/g, '').toUpperCase()) {
    value = (value << 5) | A.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const h = createHmac('sha1', Buffer.from(bytes)).update(msg).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((((h[o]! & 0x7f) << 24) | (h[o + 1]! << 16) | (h[o + 2]! << 8) | h[o + 3]!) % 1_000_000).padStart(6, '0');
}

test.describe('jobs — refuse a missing or wrong JOBS_SECRET', () => {
  for (const job of JOBS) {
    test(`/api/jobs/${job.split('?')[0]}: 401 without / with a wrong / with an unprefixed secret; GET is 405`, async ({ request }) => {
      expect((await request.post(`/api/jobs/${job}`)).status()).toBe(401);
      expect((await request.post(`/api/jobs/${job}`, { headers: { authorization: 'Bearer not-the-secret' } })).status()).toBe(401);
      expect((await request.post(`/api/jobs/${job}`, { headers: { authorization: jobsSecret() } })).status()).toBe(401);
      expect((await request.get(`/api/jobs/${job}`, { headers: auth() })).status()).toBe(405);
    });
  }
});

test.describe('jobs — run and are idempotent', () => {
  test('retention: an unkept upload past its window goes (DB + bucket), a kept one stays; a second run purges nothing', async ({ page, browser, request }) => {
    const unkept = await guestUpload(page);
    const ctx = await browser.newContext();
    const kept = await guestUpload(await ctx.newPage());
    await ctx.close();
    await sql()`update assets set purge_after = now() - interval '1 day', fulfilled_at = now() - interval '31 days' where id = ${unkept}`;
    await sql()`update assets set kept_in_home = true, purge_after = null, fulfilled_at = now() - interval '400 days' where id = ${kept}`;
    expect((await objectKeys(`assets/${unkept}/`)).length).toBeGreaterThan(0);

    const first = await request.post('/api/jobs/retention', { headers: auth() });
    expect(first.status()).toBe(200);
    const r1 = await first.json();
    expect(r1).toMatchObject({ ok: true, failed: 0, errors: [] });
    expect(r1.purged).toBeGreaterThanOrEqual(1);
    expect(await sql()`select 1 from assets where id = ${unkept}`).toHaveLength(0);
    expect(await objectKeys(`assets/${unkept}/`)).toEqual([]);
    expect(await sql()`select 1 from audit_records where event = 'PURGE_EXECUTED' and target_id = ${unkept}`).toHaveLength(1);
    expect(await sql()`select 1 from assets where id = ${kept}`).toHaveLength(1);
    expect((await objectKeys(`assets/${kept}/`)).length).toBeGreaterThan(0);

    const r2 = await (await request.post('/api/jobs/retention', { headers: auth() })).json();
    expect(r2).toMatchObject({ ok: true, purged: 0, failed: 0 });
  });

  test('reapply-erasures: needs ?since; a keepsake "restored from backup" is erased again, then reported already gone', async ({ page, request }) => {
    expect((await request.post('/api/jobs/reapply-erasures', { headers: auth() })).status()).toBe(400);
    expect((await request.post('/api/jobs/reapply-erasures?since=banana', { headers: auth() })).status()).toBe(400);

    const email = testEmail('restore');
    await quietCookies(page);
    await signInByEmailLink(page, email, '/start-creating');
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
    await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });
    const me = await accountId(email);
    const [asset] = await sql()`select * from assets where controller_account_id = ${me}`;
    const since = new Date(Date.now() - 60_000).toISOString();
    await page.goto('/account');
    await page.getByRole('button', { name: /delete all your keepsakes/i }).click();
    await page.getByRole('button', { name: /tap again — delete everything for good/i }).click();
    await expect(page.getByText(/deleted — 1 keepsake gone for good/)).toBeVisible({ timeout: 30_000 });

    // the database is "restored" from a backup taken before the delete: the row is back
    await sql()`insert into assets (id, family_id, kind, uploader_account_id, controller_account_id, visibility, moderation_status, kept_in_home)
      values (${asset!.id}, ${asset!.family_id}, ${asset!.kind}, ${me}, ${me}, ${asset!.visibility}, ${asset!.moderation_status}, true)`;
    const r1 = await (await request.post(`/api/jobs/reapply-erasures?since=${since}`, { headers: auth() })).json();
    expect(r1.failed).toEqual([]);
    expect(r1.reapplied).toBeGreaterThanOrEqual(1);
    expect(await sql()`select 1 from assets where id = ${asset!.id}`).toHaveLength(0);
    const r2 = await (await request.post(`/api/jobs/reapply-erasures?since=${since}`, { headers: auth() })).json();
    expect(r2).toMatchObject({ reapplied: 0, failed: [] });
    expect(r2.alreadyGone).toBe(r2.entries);
  });

  test('reminders: a consenting owner hears about a little one’s birthday once — the second run sends nothing', async ({ page, request }) => {
    const email = testEmail('remind');
    await quietCookies(page);
    await signInByEmailLink(page, email, '/home');
    const me = (await accountId(email))!;
    const [fam] = await sql()`select id from families where owner_account_id = ${me}`;
    const d = new Date(Date.now() + 28 * 86_400_000);
    const birthday = `2021-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    await sql()`insert into children (family_id, first_name, birthday, controller_account_id) values (${fam!.id}, 'Pip', ${birthday}, ${me})`;
    await sql()`insert into consent_records (account_id, channel, purpose, status, basis, source) values (${me}, 'EMAIL', 'REMINDERS', 'GRANTED', 'CONSENT', 'e2e')`;

    const r1 = await (await request.post('/api/jobs/reminders', { headers: auth() })).json();
    expect(r1.sent).toBeGreaterThanOrEqual(1);
    const mine = await sql()`select occasion_key, offset_days from reminder_sends where account_id = ${me}`;
    expect(mine.length).toBe(1);
    if (hasServerLog) expect(await mailTo(email, 'reminder')).toMatch(/Pip/);
    await request.post('/api/jobs/reminders', { headers: auth() });
    expect(await sql()`select 1 from reminder_sends where account_id = ${me}`).toHaveLength(1);

    // consent withdrawn → nothing more (a new nudge window would otherwise qualify)
    await sql()`insert into consent_records (account_id, channel, purpose, status, basis, source) values (${me}, 'EMAIL', 'REMINDERS', 'WITHDRAWN', 'CONSENT', 'e2e')`;
    await sql()`delete from reminder_sends where account_id = ${me}`; // reminder_sends is not append-only
    await request.post('/api/jobs/reminders', { headers: auth() });
    expect(await sql()`select 1 from reminder_sends where account_id = ${me}`).toHaveLength(0);
  });

  test('popularity: the christmas bundle stays pinned first, run after run', async ({ request }) => {
    for (let i = 0; i < 2; i++) {
      const res = await request.post('/api/jobs/popularity', { headers: auth() });
      expect(res.status()).toBe(200);
      expect((await res.json()).order[0]).toBe('christmasBundle');
      const [p] = await sql()`select popular_rank from products where key = 'christmasBundle'`;
      expect(p!.popular_rank).toBe(1);
    }
  });

  test('fulfilment: a tick runs clean and a second tick changes nothing', async ({ request }) => {
    const a = await request.post('/api/jobs/fulfilment', { headers: auth() });
    expect(a.status()).toBe(200);
    const b = await (await request.post('/api/jobs/fulfilment', { headers: auth() })).json();
    expect(b.errors).toEqual([]);
    expect(b.render).toMatchObject({ claimed: 0, ready: 0, failed: 0 });
    expect(b.submit).toMatchObject({ submitted: 0, failed: 0 });
  });
});

test.describe('health', () => {
  test('/api/health says the database answered — and nothing about the set-up', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.status()).toBe(200);
    expect(res.headers()['cache-control']).toBe('no-store');
    expect(Object.keys(await res.json()).sort()).toEqual(['build', 'db', 'ok']);
  });
  test('/api/health/render needs the jobs secret, then draws one mockup', async ({ request }) => {
    expect((await request.post('/api/health/render')).status()).toBe(401);
    const res = await request.post('/api/health/render', { headers: auth() });
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, format: 'webp' });
  });
});

test.describe('content safety', () => {
  test('with no real screening configured, an upload is HELD for review — kept, never rejected, never binned', async ({ page }) => {
    const id = await guestUpload(page);
    const [a] = await sql()`select moderation_status, moderation_detail from assets where id = ${id}`;
    expect(a!.moderation_status).toBe('FLAGGED');
    expect((a!.moderation_detail as { labels: string[] }).labels).toEqual(['screening-not-configured']);
    expect(await sql()`select 1 from audit_records where event = 'CONTENT_FLAGGED' and target_id = ${id}`).toHaveLength(1);
    expect((await objectKeys(`assets/${id}/`)).length).toBeGreaterThan(0); // the drawing is still there
    await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible(); // and the parent carries on
  });
});

test.describe('admin — review queue and support inbox', () => {
  const pages = ['/admin/review', '/admin/support'];

  test('a guest and a signed-in parent get a plain 404 — pages and picture route alike', async ({ page, browser }) => {
    const flagged = await guestUpload(page);
    for (const p of pages) expect((await page.goto(p))!.status()).toBe(404);
    expect((await page.request.get(`/api/admin/review/keepsake/${flagged}`)).status()).toBe(404);

    const ctx = await browser.newContext();
    const parent = await ctx.newPage();
    await signInByEmailLink(parent, testEmail('notadmin'), '/home');
    for (const p of pages) expect((await parent.goto(p))!.status()).toBe(404);
    expect((await parent.request.get(`/api/admin/review/keepsake/${flagged}`)).status()).toBe(404);
    await ctx.close();
  });

  test('an admin must pass two-step login; then look (logged first), clear, remove (erased) — hash-unchecked and blocked are never shown', async ({ page, browser }) => {
    test.setTimeout(180_000);
    // three held uploads from guests
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const ctx = await browser.newContext();
      ids.push(await guestUpload(await ctx.newPage()));
      await ctx.close();
    }
    const [toClear, toRemove, unchecked, blocked] = ids as [string, string, string, string];
    // as the REAL screening would leave them: the hash check passed, the classifier flagged
    const classifierFlag = { labels: ['Violence'], original: { status: 'FLAGGED', labels: ['Violence'] } };
    await sql()`update assets set moderation_detail = ${sql().json(classifierFlag)} where id in ${sql()([toClear, toRemove])}`;
    await sql()`update assets set moderation_detail = ${sql().json({ labels: ['hash-check-unavailable'], original: { status: 'FLAGGED', labels: ['hash-check-unavailable'] } })} where id = ${unchecked}`;
    await sql()`update assets set moderation_status = 'BLOCKED', moderation_detail = ${sql().json({ labels: ['csam-hash-match'] })} where id = ${blocked}`;
    const top = (id: string) => sql()`update assets set moderated_at = now() + interval '1 day' where id = ${id}`; // newest = first in the queue

    const email = testEmail('admin');
    await quietCookies(page);
    await signInByEmailLink(page, email, '/home');
    await sql()`update accounts set is_admin = true where email = ${email}`;
    const me = (await accountId(email))!;

    // no two-step yet: the set-up card, no queue, no pictures
    await page.goto('/admin/review');
    await expect(page.getByText('set up two-step login')).toBeVisible();
    await expect(page.getByRole('list', { name: 'held back for review' })).toHaveCount(0);
    expect((await page.request.get(`/api/admin/review/keepsake/${toClear}`)).status()).toBe(404);
    await page.goto('/admin/support');
    await expect(page.getByText('set up two-step login')).toBeVisible();
    await expect(page.getByRole('list', { name: 'help messages' })).toHaveCount(0);

    // enrol: key shown → the app's code → in
    await page.goto('/admin/review');
    await page.getByRole('button', { name: 'start set-up' }).click();
    const key = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    expect(key).toMatch(/^[A-Z2-7]{32}$/);
    const [stored] = await sql()`select mfa_secret from accounts where id = ${me}`;
    expect(stored!.mfa_secret).toBeNull(); // not stored until a code proves it
    await page.getByLabel('six-digit code from your authenticator app').fill('000000' === totp(key) ? '111111' : '000000');
    await page.getByRole('button', { name: 'continue' }).click();
    await expect(page.getByText('that code didn’t match — try the newest one')).toBeVisible();
    await page.getByLabel('six-digit code from your authenticator app').fill(totp(key));
    await page.getByRole('button', { name: 'continue' }).click();
    const queue = page.getByRole('list', { name: 'held back for review' });
    await expect(queue).toBeVisible();
    const [sealed] = await sql()`select mfa_secret from accounts where id = ${me}`;
    expect(sealed!.mfa_secret).toMatch(/^v1\./); // stored encrypted, not as the key
    expect(String(sealed!.mfa_secret)).not.toContain(key);
    const [{ n }] = (await sql()`select (select count(*) from assets where moderation_status = 'BLOCKED') + (select count(*) from profile_images where moderation_status = 'BLOCKED') as n`) as unknown as [{ n: string }];
    await expect(page.getByText(`${n} item${n === '1' ? '' : 's'} matched a known-illegal image list`)).toBeVisible();

    // blocked: never handed over, to an admin either
    expect((await page.request.get(`/api/admin/review/keepsake/${blocked}`)).status()).toBe(404);

    // look → the look is on the audit trail; the picture is never cached
    await top(toClear);
    await page.reload();
    const first = queue.getByRole('listitem').first();
    await expect(first).toContainText('Violence');
    const [img] = await Promise.all([page.waitForResponse((r) => r.url().includes(`/api/admin/review/keepsake/${toClear}`)), first.getByRole('button', { name: 'look' }).click()]);
    expect(img.status()).toBe(200);
    expect(img.headers()['cache-control']).toBe('no-store, private');
    expect(await sql()`select 1 from audit_records where event = 'CONTENT_REVIEW_VIEWED' and target_id = ${toClear} and actor_account_id = ${me}`).toHaveLength(1);
    await first.getByRole('button', { name: 'it’s fine' }).click();
    await expect.poll(async () => (await sql()`select moderation_status from assets where id = ${toClear}`)[0]!.moderation_status).toBe('CLEAR');
    expect(await sql()`select metadata from audit_records where event = 'CONTENT_REVIEWED' and target_id = ${toClear}`).toHaveLength(1);

    // hash check never ran: no look, no clear — only remove
    await top(unchecked);
    await page.reload();
    const uc = queue.getByRole('listitem').first();
    await expect(uc).toContainText('the safety hash check couldn’t run');
    await expect(uc.getByRole('button', { name: 'look' })).toHaveCount(0);
    await expect(uc.getByRole('button', { name: 'it’s fine' })).toHaveCount(0);
    expect((await page.request.get(`/api/admin/review/keepsake/${unchecked}`)).status()).toBe(404);

    // remove → erased everywhere
    await top(toRemove);
    await page.reload();
    await queue.getByRole('listitem').first().getByRole('button', { name: 'remove' }).click();
    await page.getByRole('button', { name: 'yes, remove it' }).click();
    await expect.poll(async () => (await sql()`select 1 from assets where id = ${toRemove}`).length).toBe(0);
    expect(await objectKeys(`assets/${toRemove}/`)).toEqual([]);
    expect(await sql()`select 1 from audit_records where event = 'ASSET_DELETED' and target_id = ${toRemove} and actor_type = 'ADMIN'`).toHaveLength(1);

    // a new session: signed in again, the code is asked for again (enrolled → "your code, please")
    const ctx2: BrowserContext = await browser.newContext();
    const again = await ctx2.newPage();
    await signInByEmailLink(again, email, '/admin/review');
    await expect(again.getByText('your code, please')).toBeVisible();
    await expect(again.getByRole('list', { name: 'held back for review' })).toHaveCount(0);
    await ctx2.close();

    // an admin flag removed → the page is gone again, even with the two-step cookie still set
    await sql()`update accounts set is_admin = false where id = ${me}`;
    expect((await page.goto('/admin/review'))!.status()).toBe(404);
    expect((await page.request.get(`/api/admin/review/keepsake/${unchecked}`)).status()).toBe(404);
  });

  // 08-B7: with no real screening (production today, until IWF is onboarded) an upload is held as
  // "screening-not-configured" — its known-CSAM hash check NEVER ran — yet hashCheckSkipped() only
  // knows the "hash-check-unavailable" label, so an admin may LOOK at it and CLEAR it, after which
  // orders.ts (CLEAR only) lets it be printed. src/authz/review.ts says such a picture may only be removed.
  test('08-B7: an upload whose hash check never ran ("screening-not-configured") can be removed, never looked at or cleared', async ({ page, browser }) => {
    const ctx = await browser.newContext();
    const held = await guestUpload(await ctx.newPage());
    await ctx.close();
    const email = testEmail('admin-b7');
    await quietCookies(page);
    await signInByEmailLink(page, email, '/home');
    await sql()`update accounts set is_admin = true where email = ${email}`;
    await page.goto('/admin/review');
    await page.getByRole('button', { name: 'start set-up' }).click();
    const key = (await page.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await page.getByLabel('six-digit code from your authenticator app').fill(totp(key));
    await page.getByRole('button', { name: 'continue' }).click();
    await expect(page.getByRole('list', { name: 'held back for review' })).toBeVisible();
    expect((await page.request.get(`/api/admin/review/keepsake/${held}`)).status()).toBe(404);
    await sql()`update assets set moderated_at = now() + interval '2 days' where id = ${held}`;
    await page.reload();
    const item = page.getByRole('list', { name: 'held back for review' }).getByRole('listitem').first();
    await expect(item).toContainText('screening-not-configured');
    await expect(item.getByRole('button', { name: 'it’s fine' })).toHaveCount(0);
    await expect(item.getByRole('button', { name: 'look' })).toHaveCount(0);
    // …but it CAN be removed — and that also takes it off the top of the queue for the tests after
    await item.getByRole('button', { name: 'remove' }).click();
    await page.getByRole('button', { name: 'yes, remove it' }).click();
    await expect.poll(async () => (await sql()`select 1 from assets where id = ${held}`).length, { timeout: 30_000 }).toBe(0);
  });

  test('support: a help message is acknowledged by email and lands in the admin inbox, where it can be marked answered', async ({ page, browser }) => {
    test.skip(!hasServerLog, 'needs E2E_SERVER_LOG (the console mailer prints the acknowledgement there)');
    const from = testEmail('helpme');
    await quietCookies(page);
    await page.goto('/help#contact');
    await page.getByRole('radio', { name: /Change or cancel an order/ }).check();
    await page.getByLabel(/Your email/).fill(from);
    await page.getByLabel('How can we help?').fill('Sweep 08: please could you change my mug size?');
    await page.getByRole('button', { name: 'send to our team' }).click();
    const done = page.getByRole('status').filter({ hasText: 'we’ve got it' });
    await expect(done).toBeVisible({ timeout: 30_000 });
    const ref = /S-[0-9A-F]{6}/.exec(await done.innerText())![0];
    expect(await mailTo(from, 'support-ack')).toContain(ref);
    expect(await mailTo('support@snickerdoodle.co.uk', 'support-request')).toContain(from);

    // an admin with two-step login sees it and marks it answered
    const ctx = await browser.newContext();
    const admin = await ctx.newPage();
    const email = testEmail('supportadmin');
    await signInByEmailLink(admin, email, '/home');
    await sql()`update accounts set is_admin = true where email = ${email}`;
    await admin.goto('/admin/support');
    await admin.getByRole('button', { name: 'start set-up' }).click();
    const key = (await admin.locator('p.font-mono').innerText()).replace(/\s/g, '');
    await admin.getByLabel('six-digit code from your authenticator app').fill(totp(key));
    await admin.getByRole('button', { name: 'continue' }).click();
    const item = admin.getByRole('list', { name: 'help messages' }).getByRole('listitem').filter({ hasText: ref });
    await expect(item).toBeVisible();
    await item.getByRole('button', { name: 'mark answered' }).click();
    await expect.poll(async () => (await sql()`select status from support_requests where ref = ${ref}`)[0]!.status).toBe('ANSWERED');
    await ctx.close();
  });

  test('data complaint: the complainant gets an acknowledgement email with the reference', async ({ page }) => {
    test.skip(!hasServerLog, 'needs E2E_SERVER_LOG (the console mailer prints the acknowledgement there)');
    const from = testEmail('complain');
    await quietCookies(page);
    await page.goto('/trust/data-complaint');
    await page.getByLabel('Your name').fill('Alex Parent');
    await page.getByLabel('Your email').fill(from);
    await page.getByLabel(/What.s your complaint about/).fill('Sweep 08: you kept my drawing longer than you said.');
    await page.getByRole('button', { name: 'send complaint' }).click();
    const done = page.getByRole('status').filter({ hasText: /we.ve got it/ });
    await expect(done).toBeVisible({ timeout: 30_000 });
    const [row] = await sql()`select id, type, due_at, received_at, complaint_ack_at from rights_requests where subject_email = ${from}`;
    expect(row!.type).toBe('COMPLAINT');
    expect(row!.complaint_ack_at).not.toBeNull();
    expect(Math.round((+row!.due_at - +row!.received_at) / 86_400_000)).toBe(30);
    const ref = `C-${String(row!.id).slice(0, 8).toUpperCase()}`;
    await expect(done).toContainText(ref);
    expect(await mailTo(from, 'complaint-ack')).toContain(ref);
  });
});
