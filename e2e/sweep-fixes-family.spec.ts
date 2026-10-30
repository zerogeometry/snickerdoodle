import { test, expect, type Page } from './test';
import { expectAccessible } from './a11y';
import { hasDb, signInByEmailLink, testEmail } from './harness';
import { quietCookies } from './helpers';

/**
 * Sweep 04 fixes on /family (reports/test-sweep-2026-10-29/04-family-invites.md), at a phone and a
 * desktop width: axe on the page with a pending invite and with the invite sheet open (04-B6 — the
 * "resend" button's name says "resend"); the sheet only asks for what it uses (04-B8 — no photo, no
 * adult birthday, no do-nothing switch; the email field is labelled); and inviting someone who's
 * already in the family says so plainly instead of silently doing nothing (04-B4).
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET');

async function openInvite(page: Page) {
  const sheet = page.getByRole('dialog');
  await expect(async () => {
    await page.getByRole('button', { name: 'invite', exact: true }).nth(1).click();
    await expect(sheet).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 30_000 });
  return sheet;
}

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
]) {
  test(`/family (${vp.name}): the invite sheet asks only for what it uses, "already in" is said plainly, axe is clean`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await quietCookies(page);
    const parent = testEmail(`b4-${vp.name}`);
    await signInByEmailLink(page, parent, '/family');
    await page.goto('/family');

    // 04-B8: a grown-up's invite: a first name (for the hello), their email (labelled), what they can do
    let sheet = await openInvite(page);
    await expect(sheet.getByText('add photo')).toHaveCount(0);
    await expect(sheet.locator('input[type="date"]')).toHaveCount(0); // no adult birthday
    await expect(sheet.getByRole('switch')).toHaveCount(0);
    await expect(sheet.getByLabel('Their email')).toBeVisible();

    // 04-B4: someone already in the family (here: the parent themself) — told, not silently "sent"
    await sheet.getByPlaceholder('First name').fill('Me');
    await sheet.getByLabel('Their email').fill(parent);
    await sheet.getByRole('button', { name: 'send invite' }).click();
    await expect(sheet.getByRole('alert')).toContainText('already in your family');

    // a real invite → a pending card with resend / cancel
    const granny = testEmail(`granny-${vp.name}`);
    await sheet.getByPlaceholder('First name').fill('Granny');
    await sheet.getByLabel('Their email').fill(granny);
    await sheet.getByRole('button', { name: 'send invite' }).click();
    await expect(page.getByText(/invite sent to Granny/)).toBeVisible();
    await page.reload();

    // 04-B6: the visible word is in the spoken name
    await expect(page.getByRole('button', { name: `resend the invite to ${granny}` })).toBeVisible();
    await expectAccessible(page, `/family with a pending invite (${vp.name})`);

    sheet = await openInvite(page);
    await expectAccessible(page, `/family invite sheet (${vp.name})`);
    // a little one: first name + birthday, no email
    await sheet.getByRole('button', { name: 'Child', exact: true }).click();
    await expect(sheet.getByLabel(/^birthday/i)).toBeVisible();
    await expect(sheet.getByLabel('Their email')).toHaveCount(0);
  });
}
