import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { test, expect, type Page } from '@playwright/test';
import sharp from 'sharp';
import { quietCookies, uploadAndOpenRange } from '../../e2e/helpers';
import { hasDb } from '../../e2e/db';
import { parentWithKeepsakeAndGiftLink, settle } from './helpers';
import { openMockup } from './mockups';

/**
 * @pairs — NOT a regression gate. Renders every /mockups screen next to the app's version of it,
 * at 390px (the mobile mockups' phones) and 1280px (the desktop mockups' browser frames), and
 * writes the side-by-sides to tests/visual/mockup-pairs/ for the review in MOCKUP-DIFF.md.
 * Run: npm run test:visual:pairs
 */
const OUT = path.join(process.cwd(), 'tests/visual/mockup-pairs');

type Screen = {
  key: string;
  mobile?: string;
  desktop?: string;
  /** a frame from snickerdoodle-visibility-and-circles.html (caption → frame), at both widths */
  circles?: string;
  app: (page: Page, ctx: Ctx) => Promise<void>;
};
type Ctx = { giftToken?: string };

/** mockup label (the .lab caption above each phone / frame) → how to reach the app's screen */
const SCREENS: Screen[] = [
  { key: 'landing', mobile: 'Landing', desktop: 'Landing', app: async (p) => void (await p.goto('/')) },
  {
    key: 'start-creating',
    mobile: 'Start Creating',
    desktop: 'Start Creating',
    app: async (p) => {
      await uploadAndOpenRange(p);
      await expect(p.locator('img[alt="your drawing on a framedPrint"]').first()).toBeVisible({ timeout: 45_000 });
    },
  },
  { key: 'catalogue', mobile: 'Catalogue', desktop: 'Catalogue', app: async (p) => void (await p.goto('/catalogue')) },
  {
    key: 'studio',
    mobile: 'Studio',
    desktop: 'Studio',
    app: async (p) => {
      await uploadAndOpenRange(p);
      await p.getByRole('button', { name: 'edit in studio' }).click();
      await expect(p.locator('canvas[aria-label^="your drawing"]')).toBeVisible({ timeout: 30_000 });
    },
  },
  {
    key: 'checkout',
    mobile: 'Checkout',
    desktop: 'Checkout',
    app: async (p) => {
      await uploadAndOpenRange(p);
      await p.getByRole('button', { name: 'customize framed print', exact: true }).click();
      await p.getByRole('button', { name: /add to basket/i }).filter({ visible: true }).first().click();
      await expect(p).toHaveURL(/\/start-creating/);
      await p.goto('/checkout');
    },
  },
  { key: 'home', mobile: 'Family Keepsake Home', desktop: 'Family Keepsake Home', app: async (p) => void (await p.goto('/home')) },
  {
    key: 'gift-link',
    mobile: 'Gift link',
    desktop: 'Gift link',
    app: async (p, ctx) => {
      await p.context().clearCookies();
      await p.goto(`/g/${ctx.giftToken}`);
    },
  },
  {
    key: 'create-gift-link',
    desktop: 'Create gift link modal',
    app: async (p) => {
      await p.goto('/home');
      await p.getByRole('button', { name: /create a gift request/i }).click();
      await expect(p.getByRole('dialog')).toBeVisible();
    },
  },
  {
    key: 'visibility',
    circles: 'Per-asset visibility',
    app: async (p) => {
      await p.goto('/home');
      await p.getByRole('button', { name: /choose who can see this keepsake/i }).first().click();
      await expect(p.getByRole('dialog')).toBeVisible();
    },
  },
  {
    key: 'add-family-member',
    circles: 'Adding a family member',
    app: async (p) => {
      await p.goto('/home');
      await p.getByRole('button', { name: /^add$/i }).first().click();
      await expect(p.getByRole('dialog')).toBeVisible();
    },
  },
];

async function mockupShot(page: Page, file: string, label: string, frameSel: string, captionSel = '.lab'): Promise<Buffer> {
  await openMockup(page, file);
  const unit = page.locator(captionSel, { hasText: label }).first();
  // the phone / frame that follows its caption
  const frame = unit.locator(`xpath=following-sibling::*[contains(concat(' ', normalize-space(@class), ' '), ' ${frameSel.slice(1)} ')][1]`);
  await frame.scrollIntoViewIfNeeded();
  return frame.screenshot({ animations: 'disabled' });
}

async function sideBySide(left: Buffer, right: Buffer, file: string) {
  const [l, r] = await Promise.all([sharp(left).metadata(), sharp(right).metadata()]);
  const h = Math.max(l.height!, r.height!);
  const gap = 24;
  await sharp({ create: { width: l.width! + r.width! + gap, height: h, channels: 3, background: '#2B2118' } })
    .composite([
      { input: left, left: 0, top: 0 },
      { input: right, left: l.width! + gap, top: 0 },
    ])
    .png({ compressionLevel: 9, palette: true })
    .toFile(file);
}

test.describe('@pairs mockups ↔ app', () => {
  test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET');

  test('@pairs render every mockup screen beside the app', async ({ page, browser }, info) => {
    test.setTimeout(600_000);
    const mobile = info.project.name.startsWith('mobile');
    mkdirSync(OUT, { recursive: true });
    await quietCookies(page);
    const { token } = await parentWithKeepsakeAndGiftLink(page);
    const cookies = await page.context().cookies();
    const ctx: Ctx = { giftToken: token };

    // mockups render in their own page (file://), at the same viewport
    const mock = await browser.newPage({ viewport: page.viewportSize()!, deviceScaleFactor: 1 });
    for (const s of SCREENS) {
      const label = mobile ? s.mobile : s.desktop;
      if (!label && !s.circles) continue;
      const left = s.circles
        ? await mockupShot(mock, 'snickerdoodle-visibility-and-circles.html', s.circles, '.frame', '.cap')
        : await mockupShot(mock, mobile ? 'snickerdoodle-mobile-mockups.html' : 'snickerdoodle-desktop-mockups.html', label!, mobile ? '.phone' : '.frame');

      await page.context().clearCookies();
      await page.context().addCookies(cookies); // signed in as the parent for each screen
      await s.app(page, ctx);
      await settle(page);
      const right = await page.screenshot({ animations: 'disabled' });
      await sideBySide(left, right, path.join(OUT, `${s.key}-${mobile ? '390' : '1280'}.png`));
    }
    await mock.close();
  });
});
