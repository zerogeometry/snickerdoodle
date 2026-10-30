import { createHash, randomBytes } from 'node:crypto';
import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { hasDb, signInByEmailLink, sql, testEmail } from './harness';
import AxeBuilder from '@axe-core/playwright';
import { expectAccessible } from './a11y';
import { accountId, firstLink, hasServerLog, keepIdFrom, mailTo, objectKeys } from './sweep08';

/**
 * Test sweep 2026-10-29, tester 08 — ACCOUNTS + DATA RIGHTS, end to end against the e2e server.
 * Sign-in is the real one-tap email link (read from the console mailer's output when the run says
 * where the server logs — E2E_SERVER_LOG — else minted as Auth.js mints one, e2e/harness.ts).
 * Every "it's gone" claim is checked straight in the database AND the storage bucket.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (.env)');

test.describe('sign in / sign out', () => {
  test('a guest is sent to /login from /account and /home', async ({ page }) => {
    await quietCookies(page);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
    await page.goto('/home');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('the real form: email → one-tap link in the email → signed in at /home; the link works once', async ({ page, browser }) => {
    test.skip(!hasServerLog, 'needs E2E_SERVER_LOG (the console mailer prints the sign-in email there)');
    await quietCookies(page);
    const email = testEmail('signup');
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'email me a magic link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    const mail = await mailTo(email, 'magic-link');
    expect(mail).toContain('your one-tap link to snickerdoodle');
    const link = firstLink(mail);
    expect(link).toContain('/api/auth/callback/email');
    await page.goto(link);
    await expect(page).toHaveURL(/\/home/);
    expect(await accountId(email)).not.toBeNull();
    const [a] = await sql()`select email_verified_at from accounts where email = ${email}`;
    expect(a!.email_verified_at).not.toBeNull();

    // the same link a second time (another browser) does not sign anyone in
    const other = await browser.newContext();
    const p2 = await other.newPage();
    await p2.goto(link);
    expect((await other.cookies()).some((c) => /authjs\.session-token/.test(c.name))).toBe(false);
    await other.close();
  });

  test('an expired sign-in link does not sign in', async ({ page }) => {
    const email = testEmail('expired');
    const token = randomBytes(32).toString('hex');
    const hashed = createHash('sha256').update(`${token}${process.env.AUTH_SECRET}`).digest('hex');
    await sql()`insert into verification_tokens (identifier, token, expires) values (${email}, ${hashed}, ${new Date(Date.now() - 60_000)})`;
    await page.goto(`/api/auth/callback/email?${new URLSearchParams({ callbackUrl: '/home', token, email })}`);
    expect((await page.context().cookies()).some((c) => /authjs\.session-token/.test(c.name))).toBe(false);
    expect(await accountId(email)).toBeNull();
  });

  test('log out ends the session in the database, and /account sends you to sign in', async ({ page }) => {
    await quietCookies(page);
    const email = testEmail('logout');
    await signInByEmailLink(page, email, '/account');
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    const id = await accountId(email);
    expect((await sql()`select count(*)::int n from sessions where user_id = ${id}`)[0]!.n).toBe(1);
    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    expect((await sql()`select count(*)::int n from sessions where user_id = ${id}`)[0]!.n).toBe(0);
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('an expired session is treated as signed out', async ({ page }) => {
    await quietCookies(page);
    const email = testEmail('stale');
    await signInByEmailLink(page, email, '/account');
    await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
    await sql()`update sessions set expires = now() - interval '1 minute' where user_id = ${await accountId(email)}`;
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('change of email — /account/confirm-email', () => {
  test('asked from the account: link to the NEW inbox, heads-up to the old; the link switches it once; a used or made-up link changes nothing', async ({ page }) => {
    test.skip(!hasServerLog, 'needs E2E_SERVER_LOG (the console mailer prints the confirm link there)');
    await quietCookies(page);
    const oldEmail = testEmail('mover');
    const newEmail = testEmail('moved');
    await signInByEmailLink(page, oldEmail, '/account');
    await page.getByRole('button', { name: /edit profile/i }).click();
    await page.getByLabel('new email address').fill(newEmail);
    await page.getByRole('button', { name: 'change', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: `check ${newEmail}` })).toBeVisible();
    expect((await sql()`select email from accounts where email = ${oldEmail}`).length).toBe(1); // nothing changes yet
    expect(await mailTo(oldEmail, 'email-change')).toContain(newEmail);
    const link = firstLink(await mailTo(newEmail, 'email-change'));
    expect(link).toContain('/account/confirm-email?token=');

    await page.goto(link);
    await expect(page.getByRole('heading', { name: 'that’s your new email ✓' })).toBeVisible();
    const me = await accountId(newEmail);
    expect(me).not.toBeNull();
    expect(await accountId(oldEmail)).toBeNull();
    expect(await sql()`select 1 from audit_records where event = 'EMAIL_CHANGED' and target_id = ${me}`).toHaveLength(1);
    expect(await mailTo(oldEmail, 'email-change')).toContain('your snickerdoodle email has changed');

    await page.goto(link); // used
    await expect(page.getByRole('heading', { name: 'that link didn’t work' })).toBeVisible();
    await page.goto('/account/confirm-email?token=made-up-made-up-made-up-made-up');
    await expect(page.getByRole('heading', { name: 'that link didn’t work' })).toBeVisible();
    expect(await accountId(newEmail)).toBe(me);
  });
});

test.describe('guest drawing adopted on sign-up', () => {
  test('"+ keepsake" as a guest → sign in with the emailed link → kept in THEIR keepsake box, off the retention clock', async ({ page }) => {
    test.skip(!hasServerLog, 'needs E2E_SERVER_LOG (the console mailer prints the sign-in email there)');
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
    await expect(page).toHaveURL(/\/login\?.*keep=/);
    const assetId = keepIdFrom(page);
    const [before] = await sql()`select kept_in_home, controller_account_id, ephemeral_claim_id, purge_after from assets where id = ${assetId}`;
    expect(before!.kept_in_home).toBe(false);
    expect(before!.controller_account_id).toBeNull();
    expect(before!.ephemeral_claim_id).not.toBeNull();
    expect(before!.purge_after).not.toBeNull(); // a guest draft is on the clock

    const email = testEmail('adopter');
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'email me a magic link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await page.goto(firstLink(await mailTo(email, 'magic-link')));
    await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });

    const me = await accountId(email);
    const [after] = await sql()`select kept_in_home, controller_account_id, uploader_account_id, ephemeral_claim_id, purge_after, visibility, family_id from assets where id = ${assetId}`;
    expect(after).toMatchObject({ kept_in_home: true, controller_account_id: me, uploader_account_id: me, ephemeral_claim_id: null, purge_after: null, visibility: 'FAMILY' });
    const [fam] = await sql()`select owner_account_id from families where id = ${after!.family_id}`;
    expect(fam!.owner_account_id).toBe(me);
  });

  // 08-B1: a guest can plant their OWN drawing in a stranger's keepsake box — "+ keepsake", then
  // type the stranger's email on /login. rememberKeepForEmail stores the guest's claim against that
  // email, and finishPendingKeeps (on /start-creating?resume=keep, any device) adopts it for whoever
  // signs in with it — the drawing lands in the stranger's private family home as if they kept it.
  test.fixme('08-B1: a guest cannot file their drawing into someone else’s keepsake box by typing their email', async ({ page, browser }) => {
    await quietCookies(page);
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
    await expect(page).toHaveURL(/\/login\?.*keep=/);
    const assetId = keepIdFrom(page);
    const victim = testEmail('victim');
    await page.getByLabel('Email').fill(victim);
    await page.getByRole('button', { name: 'email me a magic link' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    // the stranger, on their own device, follows the sign-in link to where it points
    const ctx = await browser.newContext();
    const theirs = await ctx.newPage();
    await quietCookies(theirs);
    await signInByEmailLink(theirs, victim, '/start-creating?resume=keep');
    await theirs.waitForURL(/\/start-creating$/, { timeout: 30_000 });
    const [row] = await sql()`select controller_account_id, kept_in_home from assets where id = ${assetId}`;
    expect(row!.controller_account_id).not.toBe(await accountId(victim));
    await ctx.close();
  });
});

test.describe('data rights — see / download / delete', () => {
  test('download your data: the JSON names the account and lists the keepsakes it controls', async ({ page }) => {
    await quietCookies(page);
    const email = testEmail('export');
    await signInByEmailLink(page, email, '/start-creating');
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
    await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });
    await page.goto('/account');
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /download your data/i }).click()]);
    expect(download.suggestedFilename()).toBe('snickerdoodle-your-data.json');
    const json = JSON.parse(await (await import('node:fs/promises')).readFile((await download.path())!, 'utf8'));
    expect(json.account.email).toBe(email);
    expect(json.keepsakesYouControl).toHaveLength(1);
    expect(json.keepsakesYouControl[0].keptInHome).toBe(true);
    expect(json.home.keepsakes.length).toBe(1);
  });

  test('delete all your keepsakes: two taps → rows AND stored files gone, audited, ledgered', async ({ page }) => {
    await quietCookies(page);
    const email = testEmail('eraser');
    await signInByEmailLink(page, email, '/start-creating');
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
    await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });
    const me = await accountId(email);
    const owned = await sql()`select id from assets where controller_account_id = ${me}`;
    expect(owned.length).toBe(1);
    const assetId = owned[0]!.id as string;
    expect((await objectKeys(`assets/${assetId}/`)).length).toBeGreaterThan(0);

    await page.goto('/account');
    await page.getByRole('button', { name: /delete all your keepsakes/i }).click();
    await page.getByRole('button', { name: /tap again — delete everything for good/i }).click();
    await expect(page.getByText(/deleted — 1 keepsake gone for good/)).toBeVisible({ timeout: 30_000 });

    expect(await sql()`select id from assets where id = ${assetId}`).toHaveLength(0);
    expect(await sql()`select id from storage_objects where asset_id = ${assetId}`).toHaveLength(0);
    expect(await objectKeys(`assets/${assetId}/`)).toEqual([]);
    expect(await sql()`select id from audit_records where event = 'ASSET_DELETED' and target_id = ${assetId}`).toHaveLength(1);
    expect((await objectKeys('erasure-ledger/')).length).toBeGreaterThan(0);
  });

  test('close your account: family + keepsakes + files + sessions gone, the login anonymised', async ({ page }) => {
    await quietCookies(page);
    const email = testEmail('closer');
    await signInByEmailLink(page, email, '/start-creating');
    await uploadAndOpenRange(page);
    await page.getByRole('button', { name: /\+ keepsake/ }).first().click();
    await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });
    const me = (await accountId(email))!;
    const [{ id: assetId, family_id: familyId }] = (await sql()`select id, family_id from assets where controller_account_id = ${me}`) as unknown as [{ id: string; family_id: string }];

    await page.goto('/account');
    await page.getByRole('button', { name: /close your account/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'close my account', exact: true }).click();
    await dialog.getByRole('button', { name: 'yes, close my account for good' }).click();
    await expect.poll(async () => (await sql()`select email from accounts where id = ${me}`)[0]?.email, { timeout: 30_000 }).not.toBe(email);

    expect(await sql()`select id from assets where id = ${assetId}`).toHaveLength(0);
    expect(await objectKeys(`assets/${assetId}/`)).toEqual([]);
    expect(await sql()`select id from families where id = ${familyId}`).toHaveLength(0);
    expect(await sql()`select 1 from sessions where user_id = ${me}`).toHaveLength(0);
    const [acct] = await sql()`select email, display_name, mfa_secret from accounts where id = ${me}`;
    expect(acct!.display_name).toBeNull();
    expect(acct!.email).not.toContain('example.test');
    await page.waitForURL(/localhost:\d+\/$/); // the app's own full reload to the front page
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('accessibility + both sizes', () => {
  for (const size of [{ name: 'phone', width: 390, height: 844 }, { name: 'desktop', width: 1280, height: 800 }]) {
    const shot = (n: string) => `reports/test-sweep-2026-10-29/shots/08/${n}-${size.width}.png`;

    test(`/login passes axe — ${size.name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await quietCookies(page);
      await page.goto('/login');
      await expectAccessible(page, `/login ${size.name}`);
      await page.screenshot({ path: shot('login'), fullPage: true });
    });

    test(`/account screens + close-account sheet + admin two-step card — ${size.name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await quietCookies(page);
      const email = testEmail(`a11y${size.width}`);
      await signInByEmailLink(page, email, '/account');
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
      await page.screenshot({ path: shot('account'), fullPage: true });
      await page.getByRole('button', { name: /close your account/i }).click();
      await expect(page.getByRole('button', { name: 'close my account', exact: true })).toBeVisible();
      const sheet = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
      expect(sheet.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), 'close-account sheet').toEqual([]);
      await page.screenshot({ path: shot('close-account') });

      await sql()`update accounts set is_admin = true where email = ${email}`;
      await page.goto('/admin/review');
      await expect(page.getByText('set up two-step login')).toBeVisible();
      await expectAccessible(page, `/admin/review ${size.name}`);
      await page.screenshot({ path: shot('admin-review-mfa'), fullPage: true });
    });

    // 08-B6: "Delete all your keepsakes" / "Close your account" are berry #E8786E on white — 2.85:1,
    // under the 4.5:1 WCAG AA needs for 13px text (src/app/account/AccountActions.tsx text-berry).
    test(`08-B6: /account passes axe — ${size.name}`, async ({ page }) => {
      await page.setViewportSize(size);
      await quietCookies(page);
      await signInByEmailLink(page, testEmail(`axe${size.width}`), '/account');
      await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
      await expectAccessible(page, `/account ${size.name}`);
    });
  }
});
