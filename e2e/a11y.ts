import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/**
 * Run axe (WCAG 2.2 A/AA + best practice) on the page as it stands and fail with a readable list.
 * The kraft paper's grain is a 6%-alpha noise image; axe can't measure text over an image, so the
 * scan reads the flat oat beneath it (what the grain sits on) — otherwise every contrast check on
 * the page would come back "can't tell".
 */
export async function expectAccessible(page: Page, label: string) {
  await page.addStyleTag({ content: '.kraft{background-image:none!important}' });
  // Judge the page as it SETTLES, not mid-animation: an entrance fade (pop-in, the range reveal) makes
  // text read lighter for a moment and axe would flag it. Reduced motion switches every animation off
  // (globals.css), and we let any transition still running finish first.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || (a.effect?.getComputedTiming().iterations ?? 1) === Infinity), undefined, { timeout: 5_000 }).catch(() => {});
  const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice']).analyze();
  const found = res.violations.map(
    (v) => `${v.id} (${v.impact}) — ${v.help}\n${v.nodes
      .slice(0, 5)
      .map((n) => `    ${n.target.join(' ')}: ${(n.failureSummary ?? '').replace(/\s+/g, ' ').slice(0, 200)}`)
      .join('\n')}`,
  );
  expect(found, `${label}: accessibility problems`).toEqual([]);
}
