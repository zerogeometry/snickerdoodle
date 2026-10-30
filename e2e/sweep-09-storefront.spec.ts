import { mkdirSync, writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { expectAccessible } from './a11y';
import { quietCookies } from './helpers';

/**
 * Test sweep 29 Oct 2026, tester 09 — the shop front, navigation and accessibility.
 * (reports/test-sweep-2026-10-29/09-storefront-a11y.md)
 *
 * Pins what the sweep verified on every PUBLIC page: it answers 200, has one h1, a <main>, a title and a
 * description; every image has alt text and loads; every internal link goes somewhere real; axe finds
 * nothing at 390px and 1280px; no /christmas hub; the cookie banner's "essential only" is remembered;
 * robots + sitemap + the noindex header; the installable manifest; reduced motion stops the animations.
 */

const PUBLIC = [
  '/',
  '/how-it-works',
  '/our-story',
  '/gifts',
  '/faq',
  '/help',
  '/christmas/delivery-dates',
  '/trust/privacy',
  '/trust/cookies',
  '/trust/terms',
  '/trust/family-promise',
  '/trust/data-complaint',
];

/** The product pages the running shop lists (sitemap = products on show). */
async function productPaths(page: Page): Promise<string[]> {
  const xml = await (await page.request.get('/sitemap.xml')).text();
  return [...xml.matchAll(/<loc>[^<]*?(\/products\/[^<]+)<\/loc>/g)].map((m) => m[1]!);
}

const OUT = 'test-results/sweep-09';
const save = (name: string, data: unknown) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}.json`, JSON.stringify(data, null, 2));
};

/** Scroll the whole page so lazy images start, then wait for them. */
async function loadAllImages(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), undefined, { timeout: 20_000 }).catch(() => {});
}

test.describe('public pages', () => {
  test('there is no /christmas hub (founder removed it twice)', async ({ request }) => {
    expect((await request.get('/christmas')).status()).toBe(404);
    expect((await request.get('/christmas/')).status()).toBe(404);
  });

  test('every public page and product page: 200, landmarks, title, description, images with alt that load, links that resolve', async ({ page }) => {
    test.setTimeout(600_000);
    await quietCookies(page);
    const products = await productPaths(page);
    expect(products.length, 'the sitemap lists the product pages').toBeGreaterThan(5);
    const pages = [...PUBLIC, ...products];
    const links = new Map<string, string>(); // href → first page it was seen on
    const report: Record<string, unknown> = {};
    const titles = new Map<string, string>();

    for (const path of pages) {
      const res = await page.goto(path);
      expect(res?.status(), `${path} answers 200`).toBe(200);
      await expect(page.locator('main'), `${path} has a <main>`).toHaveCount(1);
      await loadAllImages(page);
      const info = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
        h1: [...document.querySelectorAll('h1')].map((h) => h.textContent?.trim()),
        imgs: [...document.images].map((i) => ({ src: i.currentSrc || i.src, alt: i.getAttribute('alt'), ok: i.complete && i.naturalWidth > 0 })),
        hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')!),
      }));
      report[path] = { title: info.title, description: info.description, h1: info.h1, imgs: info.imgs.length };
      expect(info.title, `${path} has a title`).toBeTruthy();
      expect(info.description.length, `${path} has a meta description`).toBeGreaterThan(20);
      expect(info.h1.length, `${path} has exactly one h1 (${info.h1.join(' | ')})`).toBe(1);
      for (const i of info.imgs) {
        expect(i.alt, `${path}: ${i.src} has an alt attribute`).not.toBeNull();
        if (i.ok) continue;
        // a lazy image off to the side (the drifting example wall) hasn't been asked for yet: fetch it
        const r = await page.request.get(i.src);
        expect(r.status(), `${path}: ${i.src} loads`).toBe(200);
        expect(r.headers()['content-type'], `${path}: ${i.src} is an image`).toMatch(/^image\//);
      }
      const prev = titles.get(info.title);
      expect(prev, `${path} has its own title (same as ${prev})`).toBeUndefined();
      titles.set(info.title, path);
      for (const h of info.hrefs) {
        if (/^(mailto:|tel:|#|https?:)/.test(h)) continue;
        if (!links.has(h)) links.set(h, path);
      }
    }

    const broken: string[] = [];
    const checked: Record<string, number> = {};
    for (const [href, from] of links) {
      const url = href.split('#')[0]!;
      if (!url) continue;
      const r = await page.request.get(url, { maxRedirects: 5 });
      checked[url] = r.status();
      if (r.status() >= 400) broken.push(`${url} (${r.status()}) — linked from ${from}`);
    }
    // links to a spot on a page (#returns, #contact): the spot exists
    for (const [href, from] of links) {
      const [url, hash] = href.split('#');
      if (!hash || !url) continue;
      await page.goto(href);
      const found = await page.evaluate((id) => !!document.getElementById(decodeURIComponent(id)), hash);
      if (!found) broken.push(`${href} (no #${hash} on the page) — linked from ${from}`);
    }
    save('public-pages', { report, checked });
    expect(broken, 'no broken internal links').toEqual([]);
  });

  /** "from £X" on each /catalogue tile (the server catalogue in the database), by the tile's name. */
  async function cataloguePrices(page: Page): Promise<Map<string, string>> {
    await page.goto('/catalogue');
    await expect(page.getByRole('group', { name: 'filter the range' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: /^Enlarge .* preview$/ }).first()).toBeVisible({ timeout: 30_000 });
    const rows = await page.evaluate(() =>
      [...document.querySelectorAll('button[aria-label^="Enlarge"]')].map((b) => {
        let n = b as HTMLElement;
        for (let i = 0; i < 8 && n.parentElement && !/£/.test(n.innerText); i++) n = n.parentElement;
        return [b.getAttribute('aria-label')!.replace(/^Enlarge | preview$/g, ''), n.innerText.match(/from (£[\d.]+)/)?.[1] ?? ''] as const;
      }),
    );
    return new Map(rows);
  }
  /** The public page's headline "from £X" (the code-defined price list). */
  const pagePrice = async (page: Page, path: string) => {
    await page.goto(path);
    // the price line straight under the h1: "from £16" or, with one price, "£18"
    return (await page.locator('h1 + p').first().innerText()).match(/£[\d.]+/)?.[0] ?? '';
  };
  // product page slug → the tile's name on /catalogue
  const TILE: Record<string, string> = {
    'framed-print': 'framed print', mug: 'mug', cushion: 'cushion', 'kids-t-shirt': 'kids tee', 'adult-t-shirt': 'adult tee', jigsaw: 'jigsaw',
    'fleece-blanket': 'fleece blanket', 'greetings-card': 'greetings card', 'card-pack': 'card pack', 'wall-calendar': 'calendar',
    'ceramic-christmas-ornament': 'ceramic christmas ornament', 'christmas-bauble': 'christmas bauble', 'christmas-sack': 'christmas sack',
    'christmas-family-bundle': 'christmas family bundle', 'phone-case': 'phone case', socks: 'socks', 'height-chart': 'height chart',
    'wrapping-paper': 'wrapping paper', 'tea-towel': 'tea towel', 'playing-cards': 'playing cards', placemats: 'placemats', coasters: 'coasters',
  };
  // 09-B1: the public pages for placemats + coasters list the bundle-only packs (BUNDLE_ONLY_SKUS) and lead with them
  const BUNDLE_PACKS = ['placemats', 'coasters'];

  test('the "from" price on each public product page matches its /catalogue tile', async ({ page }) => {
    test.setTimeout(240_000);
    await quietCookies(page);
    const tiles = await cataloguePrices(page);
    const seen: Record<string, { page: string; tile: string }> = {};
    const mismatches: string[] = [];
    for (const path of await productPaths(page)) {
      const slug = path.replace('/products/', '');
      if (BUNDLE_PACKS.includes(slug)) continue;
      const tile = tiles.get(TILE[slug] ?? slug) ?? '(no tile)';
      const p = await pagePrice(page, path);
      seen[path] = { page: p, tile };
      if (p !== tile) mismatches.push(`${path}: page ${p}, catalogue ${tile}`);
    }
    save('product-prices', seen);
    expect(mismatches).toEqual([]);
  });

  test('09-B1: placemats + coasters pages show only packs sold on their own (no bundle-only "pack of 1" from-price)', async ({ page }) => {
    await quietCookies(page);
    const tiles = await cataloguePrices(page);
    for (const slug of BUNDLE_PACKS) {
      expect(await pagePrice(page, `/products/${slug}`), slug).toBe(tiles.get(slug));
      await expect(page.getByText('pack of 1', { exact: true })).toHaveCount(0);
    }
  });
});

for (const vp of [
  { name: 'phone', width: 390, height: 844 },
  { name: 'laptop', width: 1280, height: 800 },
]) {
  test.describe(`a11y on a ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('axe: every public page and product page', async ({ page }) => {
      test.setTimeout(600_000);
      await quietCookies(page);
      const failures: string[] = [];
      // (/trust/family-promise: 09-B2, pinned below)
      for (const path of [...PUBLIC.filter((p) => p !== '/trust/family-promise'), ...(await productPaths(page)), '/catalogue', '/login', '/start-creating', '/checkout']) {
        await page.goto(path);
        await page.waitForTimeout(400);
        try {
          await expectAccessible(page, path);
        } catch (e) {
          failures.push(String((e as Error).message).split('\n').slice(0, 12).join('\n'));
        }
      }
      save(`axe-${vp.name}`, failures);
      expect(failures, failures.join('\n\n')).toEqual([]);
    });

    test('09-B2: /trust/family-promise headings go h1 → h3 (axe heading-order)', async ({ page }) => {
      await quietCookies(page);
      await page.goto('/trust/family-promise');
      await expectAccessible(page, '/trust/family-promise');
    });

    test('tap targets: controls are at least 44px (inline prose links excepted)', async ({ page }) => {
      test.setTimeout(300_000);
      await quietCookies(page);
      const small: Record<string, string[]> = {};
      for (const path of [...PUBLIC, '/catalogue', '/login', '/start-creating', '/checkout', '/products/mug']) {
        await page.goto(path);
        await page.waitForTimeout(300);
        const found = await page.evaluate(() => {
          const out: string[] = [];
          for (const el of document.querySelectorAll<HTMLElement>('a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary')) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            const cs = getComputedStyle(el);
            if (cs.visibility === 'hidden' || el.closest('[aria-hidden="true"]')) continue;
            // WCAG inline exception: a link inside running text
            if (el.tagName === 'A' && el.closest('p, li, dd, td') && cs.display === 'inline') continue;
            if (el.classList.contains('sr-only')) continue;
            if (r.height < 44 || r.width < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40)}" ${Math.round(r.width)}×${Math.round(r.height)}`);
          }
          return out;
        });
        if (found.length) small[path] = found;
      }
      save(`tap-targets-${vp.name}`, small);
      // reported, not asserted (see the sweep report for the list)
    });
  });
}

test.describe('states', () => {
  test('/catalogue: a skeleton while the range loads, a friendly error with "try again" when it fails, then the range', async ({ page }) => {
    await quietCookies(page);
    let mode: 'slow' | 'fail' | 'ok' = 'slow';
    // the range arrives by a server action (a POST to the page itself)
    await page.route('**/catalogue', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      if (mode === 'fail') return route.abort();
      if (mode === 'slow') await new Promise((r) => setTimeout(r, 1500));
      return route.continue();
    });
    await page.goto('/catalogue');
    await expect(page.getByRole('status', { name: 'loading the range' }).or(page.getByLabel('loading the range'))).toBeVisible();
    await expect(page.getByRole('group', { name: 'filter the range' })).toBeVisible({ timeout: 30_000 });

    mode = 'fail';
    await page.reload();
    const err = page.getByRole('alert').filter({ hasText: 'the range didn’t load' });
    await expect(err.or(page.getByRole('alert').filter({ hasText: "the range didn't load" }))).toBeVisible({ timeout: 30_000 });
    mode = 'ok';
    await page.getByRole('button', { name: 'try again' }).click();
    await expect(page.getByRole('group', { name: 'filter the range' })).toBeVisible({ timeout: 30_000 });
  });

  test('/catalogue filters: every chip filters, says it is pressed, and the Christmas family bundle comes first', async ({ page }) => {
    await quietCookies(page);
    await page.goto('/catalogue');
    const chips = page.getByRole('group', { name: 'filter the range' }).getByRole('button');
    await expect(chips).toHaveText(['all', 'festive', 'cards & prints', 'home', 'wear', 'gifts']);
    const shown = () => page.getByRole('button', { name: /^Enlarge .* preview$/ }).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.replace(/^Enlarge | preview$/g, '')));
    const all = await shown();
    expect(all[0]).toBe('christmas family bundle');
    const seen = new Set<string>();
    for (const c of ['festive', 'cards & prints', 'home', 'wear', 'gifts']) {
      await chips.filter({ hasText: c }).click();
      await expect(chips.filter({ hasText: c })).toHaveAttribute('aria-pressed', 'true');
      const these = await shown();
      expect(these.length, c).toBeGreaterThan(0);
      for (const t of these) seen.add(t);
    }
    expect([...seen].sort(), 'the groups between them hold the whole range').toEqual([...all].sort());
    expect((await (async () => { await chips.filter({ hasText: 'festive' }).click(); return shown(); })())[0]).toBe('christmas family bundle');
  });

  test('09-B5: an unknown address shows a branded "not found" page with a way back (not the bare framework 404)', async ({ page }) => {
    await quietCookies(page);
    const res = await page.goto('/no-such-page');
    expect(res?.status()).toBe(404);
    await expect(page.locator('main')).toHaveCount(1);
    await expect(page.getByRole('link', { name: /start creating|home/i }).first()).toBeVisible();
  });

  test('09-B4: each tile’s "+ customize" button names its product for keyboard + screen-reader users', async ({ page }) => {
    await quietCookies(page);
    await page.goto('/catalogue');
    await expect(page.getByRole('group', { name: 'filter the range' })).toBeVisible();
    // the visible, focusable button (the picture's "customize mug" twin is tabIndex -1): its name says
    // which product, and starts with the words on it (WCAG 2.5.3, label in name)
    const named = await page.locator('button:not([tabindex="-1"])').evaluateAll((els) =>
      els.map((e) => ({ text: e.textContent?.trim() ?? '', name: e.getAttribute('aria-label') ?? e.textContent?.trim() ?? '' })).filter((b) => b.text === 'customize' || b.text === '+ customize'),
    );
    expect(named.length).toBeGreaterThan(5);
    expect(named.filter((b) => b.name === b.text), 'named only "customize"').toEqual([]);
    expect(named.filter((b) => !b.name.startsWith(b.text)), 'name starts with the visible words').toEqual([]);
    expect(named.map((b) => b.name)).toContain(`${named[0]!.text} mug`);
  });
});

test.describe('cookie banner', () => {
  test('shows once, "essential only" is remembered across pages and reloads, and links to the policy', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: 'Cookie choices' });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole('link', { name: 'read more' })).toHaveAttribute('href', '/trust/cookies');
    await banner.getByRole('button', { name: 'essential only' }).click();
    await expect(banner).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('snickerdoodle.cookie-choice'))).toBe('essential');
    for (const p of ['/faq', '/start-creating', '/trust/cookies']) {
      await page.goto(p);
      await page.waitForTimeout(300);
      await expect(page.getByRole('dialog', { name: 'Cookie choices' })).toHaveCount(0);
    }
    await page.reload();
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog', { name: 'Cookie choices' })).toHaveCount(0);
    // no non-essential cookie was set by choosing "essential only"
    const names = (await page.context().cookies()).map((c) => c.name);
    expect(names.filter((n) => !/^(authjs|__Secure-authjs|__Host-authjs|sd_)/.test(n))).toEqual([]);
  });

  // 09-B10 (founder, 30 Oct): equal prominence (ICO cookie guidance, Children's Code std 13) and a way to change your mind.
  test('09-B10: both choices look the same, and "cookie settings" in the footer brings the choice back', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const banner = page.getByRole('dialog', { name: 'Cookie choices' });
    await expect(banner).toBeVisible();
    const look = (name: string) =>
      banner.getByRole('button', { name }).evaluate((el) => {
        const c = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { bg: c.backgroundColor, color: c.color, border: c.borderColor, weight: c.fontWeight, size: c.fontSize, w: Math.round(r.width), h: Math.round(r.height) };
      });
    expect(await look('accept all')).toEqual(await look('essential only'));
    await banner.getByRole('button', { name: 'accept all' }).click();
    await expect(banner).toHaveCount(0);
    await page.getByRole('contentinfo').getByRole('button', { name: 'cookie settings' }).click();
    await expect(banner).toBeVisible();
    await expect(banner).toContainText('all cookies');
    await banner.getByRole('button', { name: 'essential only' }).click();
    expect(await page.evaluate(() => localStorage.getItem('snickerdoodle.cookie-choice'))).toBe('essential');
    await page.goto('/trust/cookies');
    await expect(page.getByText(/cookie settings/).first()).toBeVisible();
  });
});

test.describe('crawlers', () => {
  test('robots, sitemap and the noindex header on the open site', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toMatch(/Disallow: \/home/);
    expect(robots).toMatch(/Disallow: \/studio/);
    expect(robots).toMatch(/Sitemap: /);
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toMatch(/\/christmas<\/loc>/);
    for (const p of ['/start-creating', '/checkout', '/home', '/catalogue', '/login', '/studio']) {
      expect(sitemap, `${p} is not in the sitemap`).not.toMatch(new RegExp(`${p}</loc>`));
      const r = await request.get(p, { maxRedirects: 0 });
      expect(r.headers()['x-robots-tag'], `${p} is noindex`).toMatch(/noindex/);
    }
    for (const p of ['/', '/faq', '/products/mug']) {
      const r = await request.get(p);
      expect(r.headers()['x-robots-tag'], `${p} may be indexed`).toBeUndefined();
    }
  });

  test('installable manifest', async ({ request, page }) => {
    const m = await (await request.get('/manifest.webmanifest')).json();
    expect(m.display).toBe('standalone');
    expect(m.start_url).toBe('/home');
    for (const icon of m.icons) expect((await request.get(icon.src)).status(), icon.src).toBe(200);
    save('manifest', m);
    await page.goto('/');
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest');
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
  });
});

test.describe('motion', () => {
  test('prefers-reduced-motion turns the animations off (and they are on without it)', async ({ page }) => {
    await quietCookies(page);
    const running = () => page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName ?? 'transition'));
    await page.goto('/');
    await page.waitForTimeout(150);
    const normal = await running();
    expect(normal.length, 'the landing animates normally').toBeGreaterThan(0);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const p of ['/', '/how-it-works', '/gifts', '/catalogue', '/start-creating']) {
      await page.goto(p);
      await page.waitForTimeout(150);
      expect(await running(), `${p}: nothing animates with reduced motion`).toEqual([]);
    }
  });
});
