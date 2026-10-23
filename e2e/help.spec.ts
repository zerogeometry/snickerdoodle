import { test, expect } from '@playwright/test';
import { quietCookies } from './helpers';

/**
 * Help & contact (founder, 23 Oct): answers first — search, the most-asked — then a person. The
 * footer leads here; a search with no answer points at the form; picking a topic shows the likeliest
 * answers once more, and a sent message comes back with a reference. Strict CSP, no refusals.
 */
test('help: footer → search → no answer → topic → message sent with a reference', async ({ page }) => {
  const refusals: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) refusals.push(m.text());
  });
  await quietCookies(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'footer' }).getByRole('link', { name: 'help & contact' }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('heading', { level: 1, name: 'How can we help?' })).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'search our answers' });
  await search.fill('refund');
  await expect(page.getByRole('heading', { level: 3, name: /return/i }).first()).toBeVisible();
  await search.fill('zzqxv');
  await page.getByRole('link', { name: 'ask us' }).click();
  await expect(page).toHaveURL(/#contact$/);

  await page.getByRole('radio', { name: /Change or cancel an order/ }).check();
  await expect(page.getByText('These might help first')).toBeVisible();
  await page.getByLabel(/Your email/).fill('e2e-help@example.test');
  await page.getByLabel(/Order reference/).fill('snk-123456');
  await page.getByLabel('How can we help?').fill('Could I change the mug to the bigger size, please?');
  await page.getByRole('button', { name: 'send to our team' }).click();
  const done = page.getByRole('status').filter({ hasText: 'we’ve got it' });
  await expect(done).toBeVisible();
  await expect(done).toContainText(/S-[0-9A-F]{6}/);

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/help$/);
  expect(refusals).toEqual([]);
});

test('help: an order link arrives with the topic and reference filled in', async ({ page }) => {
  await quietCookies(page);
  await page.goto('/help?topic=order-problem&order=snk-654321#contact');
  await expect(page.getByRole('radio', { name: /not right with my order/ })).toBeChecked();
  await expect(page.getByLabel(/Order reference/)).toHaveValue('SNK-654321');
});

test('help: the FAQ page has a search above the questions and a way to a person below', async ({ page }) => {
  await quietCookies(page);
  await page.goto('/faq');
  await page.getByRole('searchbox', { name: 'search our answers' }).fill('delivery');
  await expect(page.getByText(/answers? for “delivery”/)).toBeVisible();
  await page.getByRole('link', { name: 'help page' }).click();
  await expect(page).toHaveURL(/\/help#contact$/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test('help: fits the screen, and form fields are 16px so iOS never zooms', async ({ page }) => {
    await quietCookies(page);
    await page.goto('/help?topic=order-where#contact');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const f of [page.getByRole('searchbox', { name: 'search our answers' }), page.getByLabel(/Your email/), page.getByLabel('How can we help?')]) {
      const size = await f.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      expect(size).toBeGreaterThanOrEqual(16);
    }
  });
});
