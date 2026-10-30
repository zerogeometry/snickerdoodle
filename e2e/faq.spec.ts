import { test, expect } from './test';
import { quietCookies } from './helpers';

/**
 * The FAQ page (founder, 23 Oct): reachable from the footer, its structured data matches exactly
 * what's on screen (same questions, same order), it's indexable with a canonical link, and it runs
 * under the strict script policy with no refusals.
 */
test('FAQ: footer link, schema matches the page, canonical, no CSP refusals', async ({ page }) => {
  const refusals: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Content Security Policy|Refused to/i.test(m.text())) refusals.push(m.text());
  });
  await quietCookies(page);
  await page.goto('/');
  await page.getByRole('navigation', { name: 'footer' }).getByRole('link', { name: 'FAQs' }).click();
  await expect(page).toHaveURL(/\/faq$/);
  await expect(page.getByRole('heading', { level: 1, name: /Snickerdoodle questions, answered/ })).toBeVisible();

  const shown = await page.locator('details summary h3').allTextContents();
  const schema = await page.locator('script[type="application/ld+json"]').evaluate((s) => JSON.parse(s.textContent ?? '{}'));
  const faq = (schema['@graph'] as { '@type': string; mainEntity?: { name: string; acceptedAnswer: { text: string } }[] }[]).find((g) => g['@type'] === 'FAQPage')!;
  expect(faq.mainEntity!.map((q) => q.name)).toEqual(shown);
  expect(shown.length).toBeGreaterThan(20);
  for (const q of faq.mainEntity!) expect(q.acceptedAnswer.text).not.toMatch(/\]\(\//); // no link syntax leaks

  // a question opens to its answer; the price table lists real prices
  await page.locator('#what-can-i-make summary').click();
  await expect(page.locator('#what-can-i-make table tbody tr').first()).toContainText('£');

  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/faq$/);
  expect(refusals).toEqual([]);
});
