import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { hasDb, keptAssetsOf, signIn, sql, testEmail } from './db';

/**
 * create → studio → save to the Keepsake Home → visibility (docs/03, NN2 + NN8): a signed-in
 * parent edits a drawing in the Studio, keeps it ("+ keepsake"), finds it in the Home at the
 * private-by-default FAMILY tier, and narrows it to "Only me". The tier is checked where it
 * matters — what the SERVER stored — not just the badge.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (the same database as the server under test)');

test('create → studio edit → keep in the Home (defaults to Family) → set "Only me" → it sticks', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  const parent = testEmail('keeper');
  await quietCookies(page);
  await signIn(page, parent, '/start-creating');
  await uploadAndOpenRange(page);

  // ── studio: one honest edit, then done ───────────────────────────────────────────────
  await page.getByRole('button', { name: 'edit in studio' }).click();
  await expect(page).toHaveURL(/\/studio/);
  await page.getByRole('button', { name: 'flip' }).filter({ visible: true }).first().click();
  await page.getByRole('button', { name: 'sideways' }).filter({ visible: true }).first().click();
  await expect(page.getByRole('button', { name: 'undo' })).toBeEnabled();
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/start-creating/, { timeout: 30_000 });

  // ── keep it: "+ keepsake" files it in the family's keepsake box ───────────────────────
  await page.getByRole('button', { name: '+ keepsake' }).filter({ visible: true }).first().click();
  await expect(page.getByText('kept in your keepsake box ♥').first()).toBeVisible({ timeout: 30_000 });

  const kept = await keptAssetsOf(parent);
  expect(kept, 'exactly the one drawing is kept').toHaveLength(1);
  expect(kept[0]!.visibility, 'new keepsakes default to FAMILY — never Extended, never public').toBe('FAMILY');
  // the Studio edit travelled with it (non-destructive: a design doc over the untouched original)
  const [doc] = await sql()`select studio_doc is not null as has_doc from assets where id = ${kept[0]!.id}`;
  expect(doc!.has_doc, 'the studio edit is saved on the keepsake').toBe(true);

  // ── the Home: there it is, badged Family ─────────────────────────────────────────────
  await page.goto('/home');
  const tile = page.getByRole('button', { name: /choose who can see this keepsake/i });
  await expect(tile).toHaveCount(1);
  await expect(tile).toContainText('Family');

  // ── narrow it to "Only me" ───────────────────────────────────────────────────────────
  await tile.click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText(/who can see this keepsake\?/i)).toBeVisible();
  await expect(sheet.getByText(/nothing is ever public/i)).toBeVisible();
  await sheet.getByRole('button', { name: /^only me/i }).click();
  await sheet.getByRole('button', { name: /^done$/i }).click();
  await expect(page.getByText(/visibility set to only me/i).first()).toBeVisible({ timeout: 30_000 });
  await expect(tile).toContainText('Only me');

  await expect.poll(async () => (await keptAssetsOf(parent))[0]!.visibility, { message: 'the server stored ONLY_ME' }).toBe('ONLY_ME');
  await page.reload();
  await expect(page.getByRole('button', { name: /choose who can see this keepsake/i })).toContainText('Only me');
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});
