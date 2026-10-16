import { expect, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Shared e2e helpers. Test pictures are DRAWN HERE (shapes, never a real child's art), large
 * enough to pass the print-quality rule honestly — a 1×1 PNG is (rightly) refused as too small.
 */
export async function artwork(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="2000">
    <rect x="280" y="280" width="1440" height="1440" rx="140" fill="#C8623A"/>
    <circle cx="1000" cy="860" r="360" fill="#84BBD0"/>
    <rect x="640" y="1180" width="720" height="360" rx="60" fill="#93B97C"/>
  </svg>`;
  return sharp({ create: { width: 2000, height: 2000, channels: 4, background: { r: 251, g: 245, b: 233, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

/** Answer the cookie banner up front ("essential only") so it never covers the thumb-zone buttons. */
export async function quietCookies(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('snickerdoodle.cookie-choice', 'essential');
    } catch {}
  });
}

/** Upload through the real "upload a drawing" control and wait for the personalised range. */
export async function uploadAndOpenRange(page: Page, art?: Buffer) {
  await page.goto('/start-creating');
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: /upload a drawing/i }).click(),
  ]);
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: art ?? (await artwork()) });
  await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
}

/** Mirror the app's formatPence: whole pounds have no decimals (£65, not £65.00). */
export const gbp = (pence: number) => {
  const pounds = Math.abs(pence) / 100;
  return Number.isInteger(pounds) ? `£${pounds}` : `£${pounds.toFixed(2)}`;
};
