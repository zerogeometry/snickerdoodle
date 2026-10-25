import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import base from '../../playwright.config';

/**
 * Visual checks (CLAUDE.md "design fidelity"): screenshots of the main screens at a phone width
 * (390px) and a laptop width, compared with the committed baselines in ./__screenshots__/<platform>.
 * `npm run test:visual`. Same server as the e2e suite. Always Playwright's own Chromium (never the
 * system Edge) and reduced motion, so a run is repeatable; fonts are self-hosted.
 *
 * Baselines are per platform (text rasterises differently on Windows/macOS/Linux). A machine without
 * baselines for its platform makes them once: `npm run test:visual -- --update-snapshots`, look at
 * them, commit. After an intended design change, the same command refreshes them.
 */
export default defineConfig({
  ...base,
  testDir: '.',
  outputDir: '../../test-results/visual',
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide', scale: 'css' } },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], channel: undefined, contextOptions: { reducedMotion: 'reduce' } } }],
  webServer: base.webServer && !Array.isArray(base.webServer) ? { ...base.webServer, cwd: fileURLToPath(new URL('../..', import.meta.url)) } : base.webServer,
});
