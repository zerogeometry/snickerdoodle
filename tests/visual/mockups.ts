import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';

/**
 * Render the static /mockups HTML faithfully offline-ish: the mockups pull Tabler Icons'
 * webfont from cdnjs, which CI / sandboxes often can't reach — so serve an equivalent stylesheet
 * built from the SAME icon set's SVGs in node_modules (@tabler/icons), as CSS masks.
 * (Google Fonts are fetched if the network allows; otherwise the fallback font shows — the
 * mockups' Fraunces/Mulish are pre-D12 anyway: the Scrapbook direction owns type now.)
 */
const ICON_DIR = path.join(process.cwd(), 'node_modules/@tabler/icons/icons');

function iconSvg(name: string): string | null {
  for (const style of ['outline', 'filled', '']) {
    const p = path.join(ICON_DIR, style, `${name}.svg`);
    try {
      return readFileSync(p, 'utf8');
    } catch {
      /* next */
    }
  }
  return null;
}

export function tablerCss(html: string): string {
  const names = new Set([...html.matchAll(/\bti-([a-z0-9-]+)/g)].map((m) => m[1]!));
  let css = `.ti{display:inline-block;width:1em;height:1em;vertical-align:-0.125em;background-color:currentColor;font-style:normal;line-height:1;}\n`;
  for (const n of names) {
    const svg = iconSvg(n);
    if (!svg) continue;
    const uri = `url("data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}")`;
    css += `.ti-${n}{-webkit-mask:${uri} center/contain no-repeat;mask:${uri} center/contain no-repeat;}\n`;
  }
  return css;
}

export async function openMockup(page: Page, file: string) {
  const abs = path.join(process.cwd(), 'mockups', file);
  const html = readFileSync(abs, 'utf8');
  await page.route(/tabler-icons.*\.css/, (route) => route.fulfill({ contentType: 'text/css', body: tablerCss(html) }));
  await page.goto(`file://${abs}`);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

export const hasIconSet = () => {
  try {
    return readdirSync(path.join(ICON_DIR, 'outline')).length > 0;
  } catch {
    return false;
  }
};
