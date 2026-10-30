import { test, expect } from './test';
import { quietCookies } from './helpers';

/**
 * The data-protection complaint form (s.164A) carries the help form's quiet "are you a person?" check
 * (founder, 24 Oct): solved in the background, no puzzle, nothing sent to anyone but us — a real
 * complaint still goes straight through and comes back with a reference. Strict CSP, no refusals.
 */
test('data complaint: write → send → acknowledged with a reference (the person-check is invisible)', async ({ page }) => {
  const refusals: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) refusals.push(m.text());
  });
  await quietCookies(page);
  await page.goto('/trust/data-complaint');
  await expect(page.getByRole('heading', { level: 1, name: 'Make a data-protection complaint' })).toBeVisible();
  await page.getByLabel('Your name').fill('Alex Parent');
  const email = `e2e-complaint-${Date.now().toString(36)}@example.test`; // 3 a day per email — fresh each run
  await page.getByLabel('Your email').fill(email);
  await page.getByLabel(/What.s your complaint about/).fill('You kept my drawing longer than you said you would.');
  await page.getByRole('button', { name: 'send complaint' }).click();
  const done = page.getByRole('status').filter({ hasText: /we.ve got it/ });
  await expect(done).toBeVisible({ timeout: 30_000 });
  await expect(done).toContainText(email);
  expect(refusals).toEqual([]);
});

test('data complaint: a send without the solved check is refused by the server', async ({ page }) => {
  await quietCookies(page);
  // a bot posting straight at the action (no browser-side solve) gets nowhere: the form's own
  // "we couldn't confirm you're a person" path is the only way a missing check shows to a person
  await page.route('**/trust/data-complaint', async (route, req) => {
    if (req.method() !== 'POST') return route.continue();
    const body = req.postData() ?? '';
    // strip the proof from the action's arguments
    return route.continue({ postData: body.replace(/"proof":\{[^}]*\}/, '"proof":null') });
  });
  await page.goto('/trust/data-complaint');
  await page.getByLabel('Your name').fill('Alex Parent');
  await page.getByLabel('Your email').fill('e2e-complaint-bot@example.test');
  await page.getByLabel(/What.s your complaint about/).fill('Testing that a missing check is refused.');
  await page.getByRole('button', { name: 'send complaint' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'we couldn’t confirm you’re a person' })).toBeVisible({ timeout: 30_000 });
});
