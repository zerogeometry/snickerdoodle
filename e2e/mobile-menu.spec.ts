import { test, expect } from '@playwright/test';
import { quietCookies } from './helpers';

/**
 * The marketing site's mobile menu (top right) opens as the TOP layer: everything you can see or
 * tap inside the drawer is the menu, never the page underneath; the dimmed page closes it.
 */
for (const path of ['/', '/how-it-works', '/gifts']) {
  test(`mobile menu sits on top of the page (${path})`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await quietCookies(page);
    await page.goto(path);
    await page.getByRole('button', { name: 'Open menu' }).click();
    const menu = page.getByRole('dialog', { name: 'Menu' });
    await expect(menu).toBeVisible();
    // let the drawer finish sliding in
    await page.waitForFunction(() => (document.querySelector('[role="dialog"][aria-label="Menu"] nav') as HTMLElement).getAnimations().every((a) => a.playState !== 'running'));

    const hits = await page.evaluate(() => {
      const nav = document.querySelector('[role="dialog"][aria-label="Menu"] nav')!;
      const r = nav.getBoundingClientRect();
      const out: { inNav: boolean; inMenu: boolean }[] = [];
      for (const fy of [0.1, 0.3, 0.5, 0.7, 0.9]) for (const fx of [0.2, 0.5, 0.8]) {
        const el = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
        out.push({ inNav: !!el && nav.contains(el), inMenu: !!el?.closest('[role="dialog"]') });
      }
      // and the dimmed page to the left of the drawer is the menu's backdrop
      const back = document.elementFromPoint(r.left / 2, window.innerHeight / 2);
      return { out, backdrop: back?.getAttribute('aria-label') ?? null };
    });
    for (const h of hits.out) expect(h.inNav, 'the drawer is on top').toBe(true);
    expect(hits.backdrop).toBe('Close menu');

    // the links work, and Escape closes it
    await expect(menu.getByRole('link', { name: 'gifts' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeFocused();
  });
}
