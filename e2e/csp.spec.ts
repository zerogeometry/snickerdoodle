import { test, expect, type Page } from '@playwright/test';
import { quietCookies, uploadAndOpenRange } from './helpers';

/**
 * The script Content-Security-Policy (src/lib/csp.ts, sent by src/proxy.ts) against the
 * PRODUCTION server: every page carries a per-request nonce policy, every script Next renders
 * carries that nonce, and the shop's real journey runs without the browser refusing anything —
 * home → start creating (upload) → studio → customize → basket → checkout.
 */

/** Everything the browser refused, from the `securitypolicyviolation` event AND the console. */
async function watchCsp(page: Page): Promise<string[]> {
  const refused: string[] = [];
  await page.exposeFunction('__cspViolation', (v: string) => refused.push(v));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      (window as unknown as { __cspViolation: (v: string) => void }).__cspViolation(
        `${e.effectiveDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber} on ${location.pathname}`,
      );
    });
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && /content security policy|refused to (load|execute|connect|apply|evaluate|frame|create)/i.test(m.text())) refused.push(`console: ${m.text()}`);
  });
  return refused;
}

const PAGES = ['/', '/start-creating', '/studio', '/customize/framedPrint', '/checkout'];

test('every page gets a strict, per-request nonce policy, and every script Next renders carries it', async ({ request }) => {
  const seen = new Set<string>();
  for (const path of PAGES) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const csp = res.headers()['content-security-policy'] ?? '';
    const nonce = /script-src 'self' 'nonce-([A-Za-z0-9+/=]+)' 'strict-dynamic'/.exec(csp)?.[1];
    expect(nonce, `${path}: nonce-based script-src`).toBeTruthy();
    expect(csp, path).not.toContain('unsafe-eval');
    expect(csp, path).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp, path).toContain("object-src 'none'");
    expect(csp, path).toContain("base-uri 'none'");
    expect(csp, path).toContain("frame-ancestors 'none'");
    expect(seen.has(nonce!), `${path}: nonce is fresh`).toBe(false);
    seen.add(nonce!);

    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    expect(scripts.length, `${path}: Next rendered its scripts`).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag, `${path}: script carries this request's nonce`).toContain(`nonce="${nonce}"`);
  }
});

test('the shop journey runs with no CSP violations: home → upload → studio → customize → checkout', async ({ page }) => {
  test.setTimeout(240_000);
  const refused = await watchCsp(page);
  await quietCookies(page);
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  try {
    await shopJourney(page);
  } finally {
    // even if a step above fails, say what (if anything) the browser refused on the way
    await test.info().attach('csp-refusals', { body: refused.join('\n') || '(none)', contentType: 'text/plain' });
  }
  expect(refused, refused.join('\n')).toEqual([]);
  expect(pageErrors, pageErrors.join(' | ')).toEqual([]);
});

async function shopJourney(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('main')).toBeVisible();
  // client-side JS is really running (hydrated) — a page whose scripts were blocked can't do this
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { next?: unknown }).next))).toBe(true);

  // start creating: a real upload (direct to the private bucket when direct uploads are on — the
  // connect-src storage origin), the instant local preview (blob:/data:), the range's mockups
  await uploadAndOpenRange(page);

  // the studio
  await page.getByRole('button', { name: 'edit in studio' }).click();
  await expect(page).toHaveURL(/\/studio/);
  // the drawing is fetched + decoded before the tools act on it
  await expect(page.getByLabel('your drawing — use the tools to edit it')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'flip' }).first().click();
  await page.getByRole('button', { name: 'sideways' }).click();
  await expect(page.getByRole('button', { name: 'undo' })).toBeEnabled();
  await page.getByRole('banner').getByRole('button', { name: 'done' }).click();
  await expect(page).toHaveURL(/\/start-creating/);

  // a customize page, then into the basket
  await page.getByRole('button', { name: 'customize framed print', exact: true }).click();
  await expect(page).toHaveURL(/\/customize\/framedPrint/);
  await expect(page.getByRole('button', { name: /add to basket/ })).toBeVisible({ timeout: 45_000 });
  await page.getByRole('button', { name: /add to basket/ }).click();
  await expect(page).toHaveURL(/\/start-creating/);
  await expect(page.getByText(/1 item added to your basket/i)).toBeVisible({ timeout: 30_000 });

  // checkout (the Stripe hand-off is a full-page redirect, so nothing of Stripe's runs here)
  await page.goto('/checkout');
  await expect(page.getByRole('heading', { name: /your basket/i })).toBeVisible();
  await expect(page.getByText('framed print').first()).toBeVisible();
}

test('the watcher really catches a refusal (so a silent pass above means something)', async ({ page }) => {
  const refused = await watchCsp(page);
  await page.goto('/');
  // a picture from a site the policy doesn't name — refused before any request leaves the browser
  await page.evaluate(() => {
    const img = document.createElement('img');
    img.src = 'https://not-allowed.invalid/x.png';
    document.body.appendChild(img);
  });
  await expect.poll(() => refused.join('\n')).toMatch(/img-src blocked https:\/\/not-allowed\.invalid/);
});
