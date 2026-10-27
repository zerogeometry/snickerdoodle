import { defineConfig } from '@playwright/test';
import { BASE_URL, chromium, webServer } from './e2e/config';

/**
 * Visual regression (CLAUDE.md "Design fidelity": diff every screen at ~390px AND desktop).
 *   npm run test:visual            compare against the committed baselines
 *   npm run test:visual:update     re-record them after an INTENDED visual change (review the diff!)
 *   npm run test:visual:pairs      re-render the /mockups ↔ app side-by-sides (tests/visual/mockup-pairs)
 *
 * Baselines are Linux Chromium (tests/visual/__screenshots__/<project>/). Motion is forced off
 * (prefers-reduced-motion + Playwright's animation freeze), fonts are awaited, and dynamic text
 * (dates, generated names) is masked — so a diff means the LOOK changed.
 */
const viewportOnly = { ...chromium, deviceScaleFactor: 1, reducedMotion: 'reduce' as const, locale: 'en-GB', timezoneId: 'Europe/London' };

export default defineConfig({
  testDir: './tests/visual',
  globalSetup: './e2e/global-setup.ts',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{arg}{ext}',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000,
  grepInvert: process.env.VISUAL_PAIRS ? undefined : /@pairs/,
  grep: process.env.VISUAL_PAIRS ? /@pairs/ : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-visual' }]] : [['list']],
  expect: {
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // anti-aliasing noise between Chromium builds / hosts, never a layout change
      maxDiffPixelRatio: 0.015,
      threshold: 0.25,
    },
  },
  use: {
    baseURL: BASE_URL,
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    screenshot: 'only-on-failure',
    // The PWA service worker (production only) caches build assets: keep every run on the
    // network so a baseline can never be painted from a previous build's cache.
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'mobile-390',
      use: { ...viewportOnly, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' },
    },
    { name: 'desktop-1280', use: { ...viewportOnly, viewport: { width: 1280, height: 800 } } },
  ],
  webServer,
});
