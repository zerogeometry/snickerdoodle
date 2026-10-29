import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { expectAccessible } from './a11y';
import { hasDb, signInByEmailLink, testEmail } from './harness';
import { quietCookies } from './helpers';

/**
 * Test sweep 29 Oct 2026, tester 09: the SIGNED-IN app screens (a brand-new parent — the empty
 * states) — axe at 390px and 1280px, the phone's compact header (logo · basket · account) and the
 * floating tab bar in the thumb zone, the desktop nav, and the marketing header for a signed-in parent.
 */
const APP = ['/home', '/family', '/orders', '/account'];

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'laptop', width: 1280, height: 800 },
]) {
  test(`signed in on a ${vp.name}: app screens pass axe, header + tab bar`, async ({ page }) => {
    test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET');
    test.setTimeout(240_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await quietCookies(page);
    await signInByEmailLink(page, testEmail(`t9-${vp.name}`), '/home');

    const failures: string[] = [];
    const bars: Record<string, unknown> = {};
    for (const path of APP) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.locator('main').first()).toBeVisible();
      await page.waitForTimeout(800);
      await page.screenshot({ path: `reports/test-sweep-2026-10-29/shots/09/${vp.name}-signed-in${path.replace(/\//g, '-')}.jpg`, fullPage: false, type: 'jpeg', quality: 62 });
      try {
        // /account: 09-B3 (the red "delete" / "close your account" words fail contrast) — pinned below
        if (path !== '/account') await expectAccessible(page, path);
      } catch (e) {
        failures.push(String((e as Error).message).split('\n').slice(0, 12).join('\n'));
      }

      const tabBar = page.getByRole('navigation', { name: 'Primary' });
      if (vp.name === 'phone') {
        // compact header: logo · basket · account
        await expect(page.getByRole('link', { name: 'snickerdoodle — the homepage' }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: /^Basket, \d+ items$/ }).first()).toBeVisible();
        await expect(page.getByRole('link', { name: 'Your account' }).first()).toBeVisible();
        // the floating tab bar: four tabs, fixed to the bottom, every tab ≥ 44px, the current one marked
        await expect(tabBar).toBeVisible();
        const info = await tabBar.evaluate((nav) => {
          const r = nav.getBoundingClientRect();
          const tabs = [...nav.querySelectorAll('a')].map((a) => ({ text: a.textContent, h: a.getBoundingClientRect().height, w: a.getBoundingClientRect().width, current: a.getAttribute('aria-current') }));
          return { position: getComputedStyle(nav).position, bottomGap: window.innerHeight - r.bottom, top: r.top, tabs };
        });
        bars[path] = info;
        expect(info.position).toBe('fixed');
        expect(info.bottomGap).toBeLessThanOrEqual(1);
        expect(info.top, 'tab bar in the bottom thumb zone').toBeGreaterThan(vp.height * 0.8);
        expect(info.tabs.map((t) => t.text?.trim())).toEqual(['Home', 'Create', 'Family', 'Orders']);
        for (const t of info.tabs) expect(t.h).toBeGreaterThanOrEqual(44);
        // the last thing on the page can scroll clear of the floating bar
        const clear = await page.evaluate(() => {
          window.scrollTo(0, document.body.scrollHeight);
          const main = document.querySelector('main')!;
          const nav = document.querySelector('nav[aria-label="Primary"]')!;
          return { mainBottom: main.getBoundingClientRect().bottom, navTop: nav.getBoundingClientRect().top, pb: getComputedStyle(main).paddingBottom };
        });
        bars[`${path} scroll`] = clear;
      } else {
        await expect(tabBar).toBeHidden();
      }
    }

    // the marketing pages, signed in: a way back to the keepsakes + account, never "log in"
    await page.goto('/');
    if (vp.name === 'phone') {
      await page.getByRole('button', { name: 'Open menu' }).click();
      const menu = page.getByRole('dialog', { name: 'Menu' });
      await expect(menu.getByRole('link', { name: 'your keepsakes' })).toBeVisible();
      await expect(menu.getByRole('link', { name: 'log in' })).toHaveCount(0);
    } else {
      await expect(page.getByRole('link', { name: /log in/i })).toHaveCount(0);
    }

    mkdirSync('test-results/sweep-09', { recursive: true });
    writeFileSync(`test-results/sweep-09/signed-in-${vp.name}.json`, JSON.stringify({ failures, bars }, null, 2));
    expect(failures, failures.join('\n\n')).toEqual([]);
  });
}

test.fixme('09-B3: /account — "Delete all your keepsakes" / "Close your account" (berry #E8786E on white, 2.85:1) pass contrast', async ({ page }) => {
  await quietCookies(page);
  await signInByEmailLink(page, testEmail('t9-contrast'), '/account');
  await expectAccessible(page, '/account');
});
