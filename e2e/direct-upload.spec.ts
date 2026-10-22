import { test, expect } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

// Direct browser → bucket uploads (S3_DIRECT_UPLOADS=true on the server under test). Proves the
// real browser path: the CORS preflight passes, the bytes go to a quarantine key (not through the
// app server), the server finalises it into a usable draft, and the finalise ticket stays out of
// page JS. Run with: S3_DIRECT_UPLOADS=true npm run test:e2e -- direct-upload
test.skip(process.env.S3_DIRECT_UPLOADS !== 'true', 'direct uploads are off for this server');

test('direct upload: the drawing goes straight to quarantine, then becomes a working draft', async ({ page, context }) => {
  await quietCookies(page);
  const put = page.waitForResponse((r) => r.request().method() === 'PUT' && /\/quarantine\/[0-9a-f-]{36}(\?|$)/.test(r.url()), { timeout: 60_000 });

  await uploadAndOpenRange(page);
  await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint(\?|$)/);
  await page.getByRole('button', { name: /add to basket/ }).click();

  const res = await put;
  expect(res.status()).toBe(200);
  // the signed headers went with it; no app cookie travels to the bucket
  const sent = await res.request().allHeaders();
  expect(sent['content-type']).toBe('application/octet-stream');
  expect(sent.cookie).toBeUndefined();

  // finalised into a real draft: the basket line carries the artwork
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });

  // the draft's claim was granted; the (spent) ticket cookie is httpOnly — never readable by page JS
  const cookies = await context.cookies();
  expect(cookies.find((c) => c.name === 'sd_upload_claims')?.httpOnly).toBe(true);
  const ticket = cookies.find((c) => c.name === 'sd_upload_tickets');
  if (ticket) expect(ticket.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('sd_upload_tickets');
});
