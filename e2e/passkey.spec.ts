import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './test';
import { quietCookies } from './helpers';
import { hasDb, signInByEmailLink, sql, testEmail } from './harness';
import { expectAccessible } from './a11y';

/**
 * "Sign in with Face ID" (passkeys, founder 17 Nov 2026), end to end in a real browser with Chromium's VIRTUAL
 * authenticator standing in for the phone's Face ID (it says "yes, it's them" automatically). Against the e2e server
 * (localhost is the passkey's site there). The email sign-in is still the way in, and still works alongside.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (.env)');

async function virtualFaceId(page: Page): Promise<{ cdp: CDPSession; id: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, id: authenticatorId };
}

const signedIn = async (page: Page) => (await page.context().cookies()).some((c) => /authjs\.session-token/.test(c.name));

test('email sign-in → "skip the email next time?" → Face ID sign-in → listed on the account → removed, and it stops working', async ({ page }) => {
  await quietCookies(page, { passkeyCard: true });
  const phone = await virtualFaceId(page);
  const email = testEmail('passkey');

  // 1. a normal email sign-in lands on the keepsake home, with the small optional card
  await signInByEmailLink(page, email, '/home');
  await expect(page).toHaveURL(/\/home/);
  const card = page.getByRole('region', { name: 'skip the email next time?' });
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'not now' })).toBeVisible();
  await expectAccessible(page, 'home with the passkey card');
  await card.getByRole('button', { name: /^use / }).click();
  await expect(page.getByRole('status').filter({ hasText: 'all set' })).toBeVisible();

  const [acct] = await sql()`select id from accounts where email = ${email}`;
  const keys = await sql()`select id, device_label, public_key from passkeys where account_id = ${acct!.id}`;
  expect(keys).toHaveLength(1);
  expect(keys[0]!.device_label).toBe('a windows computer');
  expect((await sql()`select count(*)::int n from audit_records where event = 'PASSKEY_ADDED' and target_id = ${keys[0]!.id}`)[0]!.n).toBe(1);
  // the virtual phone holds the private key; we only ever got the public half
  expect((await phone.cdp.send('WebAuthn.getCredentials', { authenticatorId: phone.id })).credentials).toHaveLength(1);

  // 2. the account page lists it (device + date added) with a remove button
  await page.goto('/account');
  const section = page.getByRole('region', { name: /^sign in with / });
  await expect(section.getByText('a windows computer')).toBeVisible();
  await expect(section.getByText(/^added \d+ \w+ \d{4}/)).toBeVisible();
  const remove = section.getByRole('button', { name: /^remove a windows computer/ });
  await expect(remove).toBeVisible();
  expect(await remove.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
  await expectAccessible(page, 'account with a passkey');

  // 3. log out, then back in with Face ID — no email. This device used it, so it's the first button.
  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  expect(await signedIn(page)).toBe(false);
  await page.goto('/login?next=%2Faccount');
  await expect(page.getByRole('button', { name: 'email me a magic link' })).toBeVisible(); // the email way is still there
  await expectAccessible(page, 'login with Face ID');
  await page.getByRole('button', { name: /^sign in with / }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole('heading', { name: 'Your account' })).toBeVisible();
  const [s] = await sql()`select sign_in_method, created_at from sessions where user_id = ${acct!.id}`;
  expect(s!.sign_in_method).toBe('passkey');
  // a brand-new sign-in: counts as fresh for A-63 (the last 15 minutes)
  expect(Date.now() - new Date(s!.created_at).getTime()).toBeLessThan(5 * 60_000);
  // and no "skip the email" card after a Face ID sign-in
  await page.goto('/home');
  await expect(page.getByRole('region', { name: 'skip the email next time?' })).toHaveCount(0);

  // 4. remove it on the account page: it's gone, logged, and Face ID no longer signs in
  await page.goto('/account');
  await page.getByRole('region', { name: /^sign in with / }).getByRole('button', { name: /^remove a windows computer/ }).click();
  await expect(page.getByText('none yet — you sign in with your email.')).toBeVisible();
  expect(await sql()`select id from passkeys where account_id = ${acct!.id}`).toHaveLength(0);
  expect((await sql()`select count(*)::int n from audit_records where event = 'PASSKEY_REMOVED' and target_id = ${keys[0]!.id}`)[0]!.n).toBe(1);
  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).toHaveURL(/localhost:\d+\/$/);
  await page.goto('/login');
  await page.getByRole('button', { name: /^sign in with / }).click();
  await expect(page.locator('#passkey-problem')).toContainText('isn’t set up for snickerdoodle any more');
  expect(await signedIn(page)).toBe(false);
});

test('"not now" on the card means not again on this device', async ({ page }) => {
  await quietCookies(page, { passkeyCard: true });
  await virtualFaceId(page);
  const email = testEmail('passkey-nope');
  await signInByEmailLink(page, email, '/home');
  const card = page.getByRole('region', { name: 'skip the email next time?' });
  await card.getByRole('button', { name: 'not now' }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: /welcome/i }).or(page.getByText(/welcome back/))).toBeVisible();
  await expect(page.getByRole('region', { name: 'skip the email next time?' })).toHaveCount(0);
  const [acct] = await sql()`select id from accounts where email = ${email}`;
  expect(await sql()`select id from passkeys where account_id = ${acct!.id}`).toHaveLength(0);
});

test('on a device that has never used one, the email form comes first and Face ID sits quietly under it', async ({ page }) => {
  await quietCookies(page, { passkeyCard: true });
  await virtualFaceId(page);
  await page.goto('/login');
  const email = page.getByRole('button', { name: 'email me a magic link' });
  const faceId = page.getByRole('button', { name: /^sign in with / });
  await expect(email).toBeVisible();
  await expect(faceId).toBeVisible();
  expect((await email.boundingBox())!.y).toBeLessThan((await faceId.boundingBox())!.y);
  expect(await faceId.evaluate((el) => (el as HTMLElement).offsetHeight)).toBeGreaterThanOrEqual(44);
  // no passkey for this site on this "phone" yet: a calm note, not an error page, and still signed out
  await faceId.click();
  await expect(page.locator('#passkey-problem')).toBeVisible();
  expect(await signedIn(page)).toBe(false);
});

test('on the account page, adding Face ID needs a sign-in in the last 15 minutes (a signed-in family tablet can’t)', async ({ page }) => {
  await quietCookies(page, { passkeyCard: true });
  await virtualFaceId(page);
  const email = testEmail('passkey-stale');
  await signInByEmailLink(page, email, '/account');
  const section = page.getByRole('region', { name: /^sign in with / });
  await expect(section.getByRole('button', { name: /^add / })).toBeVisible();
  // the same sign-in, an hour on
  const [acct] = await sql()`select id from accounts where email = ${email}`;
  await sql()`update sessions set created_at = now() - interval '1 hour' where user_id = ${acct!.id}`;
  await page.reload();
  await expect(section.getByRole('button', { name: /^add / })).toHaveCount(0);
  await expect(section.getByRole('status')).toContainText('sign in again first');
  await expect(section.getByRole('link', { name: 'sign in again' })).toHaveAttribute('href', '/login?next=/account');
});
