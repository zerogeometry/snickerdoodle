import { expect, type Page } from './test';
import { sql } from './harness';

/**
 * Steps for the D27 flows (founder, 10 Nov 2026: one gift link PER PERSON, the joiner's own yes, home circle) that
 * several specs share. Each drives the real UI; the privacy assertions stay in the specs.
 */

/** On /home: open "create a gift request" with its pre-ticked picks and go to "who's it for?". */
export async function openGiftSheetWho(page: Page) {
  await page.goto('/home');
  await page.getByRole('button', { name: /create a gift request/ }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: /next: who’s it for\?/ }).click();
  await expect(dialog.getByText('who’s it for? each person gets their own link')).toBeVisible();
  return dialog;
}

/**
 * An OPEN link to copy / WhatsApp yourself (founder answer C: you pick who it's for). It shows only what that circle
 * may see. Returns the link's path (/g/…).
 */
export async function makeOpenGiftLink(page: Page, circle: 'home' | 'family' | 'extended family' = 'family'): Promise<string> {
  const dialog = await openGiftSheetWho(page);
  await dialog.getByRole('button', { name: /or copy a link to share yourself/ }).click();
  await dialog.getByRole('group', { name: 'who the link is for' }).getByRole('button', { name: circle, exact: true }).click();
  await dialog.getByRole('button', { name: /make the link/ }).click();
  const shown = dialog.getByText(/\/g\/[A-Za-z0-9_-]+/);
  await expect(shown).toBeVisible({ timeout: 30_000 });
  const path = /\/g\/[A-Za-z0-9_-]+/.exec((await shown.textContent()) ?? '')![0];
  await page.keyboard.press('Escape');
  return path;
}

/**
 * Send the picks to someone NEW by email — their own link, emailed only to them (one per person). With `invite`, the
 * link carries an invite bound to their address at the circle that relationship gives them. Returns their path.
 */
export async function sendGiftLinkTo(page: Page, email: string, opts: { invite?: 'Grandparent' | 'Parent' } = {}): Promise<string> {
  const dialog = await openGiftSheetWho(page);
  if (opts.invite) {
    await dialog.getByRole('switch', { name: 'Also invite them to join the family' }).click();
    await dialog.getByRole('group', { name: 'how they’re related' }).getByRole('button', { name: opts.invite, exact: true }).click();
  }
  await dialog.getByLabel('their email').fill(email);
  await dialog.getByRole('button', { name: /^send their link$/ }).click();
  await expect(dialog.getByText('sent to 1 person')).toBeVisible({ timeout: 30_000 });
  await dialog.getByRole('button', { name: 'done' }).click();
  const [link] = await sql()`select token from gift_links where recipient_email = ${email.toLowerCase()} order by created_at desc limit 1`;
  expect(link, `a link of their own for ${email}`).toBeTruthy();
  return `/g/${link!.token as string}`;
}

/** The newest keepsake on /home, shared with the extended family (who can see this keepsake? → Extended family). */
export async function shareNewestWithExtended(page: Page) {
  await page.goto('/home');
  await page.getByRole('button', { name: 'choose who can see this keepsake' }).first().click();
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('button', { name: /Extended family/ }).click();
  await sheet.getByRole('button', { name: 'done' }).click();
  await expect(page.getByText(/visibility set to extended/)).toBeVisible({ timeout: 15_000 });
}

/** The join card (D27: never a silent join) — the joiner says yes. */
export async function sayYesToJoin(page: Page, circle: 'home' | 'family' = 'family') {
  const yes = page.getByRole('button', { name: circle === 'home' ? /^yes, (join|move into) the home$/ : /^yes, join the family$/ });
  await expect(yes).toBeVisible({ timeout: 20_000 });
  await yes.click();
  // joined: the page moves on (to their family's box, or back to the gift list they came from)
  await expect(page).not.toHaveURL(/\/join\//, { timeout: 30_000 });
}
