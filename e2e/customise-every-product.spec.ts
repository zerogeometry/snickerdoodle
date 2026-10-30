import { test, expect, type Page } from './test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { quietCookies, uploadAndOpenRange } from './helpers';
import { gbp, goClient, optionGroup, pressedIn, rangeReady, shopCatalogue, waitForAsset, type ShopProduct, type ShopVariant } from './shop-db';

/**
 * Test sweep 29 Oct (tester 02): EVERY product on show, at phone AND desktop size, on /customize/[key]:
 * the page loads with the drawing composed onto the product (a /api/mockup compose that comes back ok
 * for the chosen variant, painted on screen), nothing spills sideways, the primary action sits in the
 * thumb zone on a phone, and EVERY option chip (size / orientation / colour / phone case / finish)
 * picks the database's variant for that combination at the database's price — with a fresh preview
 * of that variant. The builders (card pack, calendar, family bundle) have their own specs.
 */
const BUILDERS = new Set(['cardPack', 'calendar', 'christmasBundle']);
const GROUPS = ['Size', 'Orientation', 'Colour', 'Case', 'Finish'] as const;
const ATTR: Record<(typeof GROUPS)[number], string> = { Size: 'size', Orientation: 'orientation', Colour: 'colour', Case: 'grade', Finish: 'finish' };
const BR = String.fromCharCode(10);
const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SHOTS = 'reports/test-sweep-2026-10-29/shots/02';

type Compose = { variantId: string; ok: boolean; view?: string; status?: number; reason?: string };

function trackComposes(page: Page): Compose[] {
  const seen: Compose[] = [];
  page.on('response', async (res) => {
    if (!res.url().endsWith('/api/mockup') || res.request().method() !== 'POST') return;
    try {
      const body = JSON.parse(res.request().postData() ?? '{}') as { variantId: string; view?: string };
      const json = (await res.json()) as { ok: boolean; reason?: string; error?: string };
      seen.push({ variantId: body.variantId, ok: json.ok, view: body.view, status: res.status(), reason: json.ok ? undefined : JSON.stringify(json).slice(0, 160) });
    } catch {
      /* aborted (superseded) compose */
    }
  });
  return seen;
}

/** The DB variant the page's pressed chips pick (the cushion's single-sided square when sides is open). */
async function chosenVariant(page: Page, p: ShopProduct, extra: Record<string, string> = {}): Promise<ShopVariant | null> {
  const want: Record<string, string> = { ...extra };
  for (const g of GROUPS) {
    const v = await pressedIn(page, g);
    if (v) want[ATTR[g]] = v;
  }
  const matches = p.variants.filter((v) => Object.entries(want).every(([k, x]) => (v.attributes[k] ?? (k === 'orientation' ? 'portrait' : undefined)) === x));
  // single-size products have no Size chips: any one variant left is it
  const one = matches.length === 1 ? matches[0]! : matches.find((v) => (v.attributes.sides ?? 'single') === 'single' && matches.length <= 2) ?? null;
  return one;
}

const addButton = (page: Page) => page.getByRole('button', { name: /^(add to basket|update basket) · / });

async function expectPrice(page: Page, p: ShopProduct, note: string, extra: Record<string, string> = {}) {
  const v = await chosenVariant(page, p, extra);
  expect(v, `${p.key} ${note}: the chips pick exactly one variant`).not.toBeNull();
  await expect(addButton(page), `${p.key} ${note}: price`).toHaveText(new RegExp(`· ${gbp(v!.pricePence).replace('.', '\\.')}$`));
  return v!;
}

/** The chosen variant's compose came back ok (the drawing composed onto that exact variant) and painted. */
async function expectComposed(page: Page, seen: Compose[], p: ShopProduct, v: ShopVariant) {
  await expect
    .poll(() => seen.some((c) => c.variantId === v.id && c.ok), { message: `${p.key} ${v.sku}: composed ok`, timeout: 60_000 })
    .toBe(true)
    .catch((e: Error) => {
      const tried = seen.filter((c) => c.variantId === v.id);
      throw new Error(`${e.message.split(BR)[0]} — composes for this variant: ${tried.length ? JSON.stringify(tried) : 'none answered'}`);
    });
  const img = page.locator(`img[alt="your drawing on a ${p.key}"]`).first();
  await expect(img).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
}

const results: Record<string, unknown> = {};

for (const vp of [
  { name: 'phone', width: 390, height: 844, touch: true },
  { name: 'desktop', width: 1280, height: 800, touch: false },
] as const) {
  test.describe(`every product · ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch });

    test(`customize page, previews and every option (${vp.name})`, async ({ page }) => {
      test.setTimeout(30 * 60_000);
      mkdirSync(SHOTS, { recursive: true });
      const shop = (await shopCatalogue()).filter((p) => !BUILDERS.has(p.key));
      expect(shop.length, 'the shop has products').toBeGreaterThan(10);
      const seen = trackComposes(page);
      await quietCookies(page);
      await uploadAndOpenRange(page);
      await rangeReady(page);
      await waitForAsset(page);

      const failures: string[] = [];
      for (const p of shop) {
        const log: string[] = [];
        try {
        await goClient(page, `/customize/${p.key}`);
        await expect(page.getByRole('heading', { level: 1, name: p.label, exact: true })).toBeVisible({ timeout: 30_000 });
        // a phone case's "size" is the phone, typed into its own picker (no chips) — it opens on the default phone
        const phone: Record<string, string> = p.key === 'phoneCase' ? { size: p.variants.find((x) => x.isDefault)!.attributes.size! } : {};
        let v = await expectPrice(page, p, 'default', phone);
        // opens on the default variant — its orientation follows the drawing's shape (a square drawing → portrait)
        const def = p.variants.find((x) => x.isDefault)!;
        expect(v.attributes.size === def.attributes.size && v.attributes.colour === def.attributes.colour, `${p.key}: opens on its default variant (got ${v.sku}, default ${def.sku})`).toBe(true);
        await expectComposed(page, seen, p, v);
        log.push(`default ${v.sku} ${gbp(v.pricePence)} composed`);
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${p.key}: no sideways scroll`).toBeLessThanOrEqual(0);
        if (vp.touch) {
          const b = (await addButton(page).boundingBox())!;
          expect(b.y + b.height, `${p.key}: add to basket in the thumb zone`).toBeGreaterThan(vp.height - 120);
          expect(b.height, `${p.key}: add to basket ≥44px`).toBeGreaterThanOrEqual(44);
        }
        await page.screenshot({ path: `${SHOTS}/${vp.name}-${p.key}.jpg`, type: 'jpeg', quality: 55 });

        // every chip in every group → the DB's variant + price, and a preview of that variant
        // phone case: EVERY phone in the catalogue, typed + picked, then each case + finish chip for it
        if (p.key === 'phoneCase') {
          const models = [...new Set(p.variants.map((x) => x.attributes.size!))];
          const box = page.getByRole('combobox', { name: /your phone/i });
          for (const m of models) {
            await box.fill(m);
            await page.getByRole('option', { name: m, exact: true }).click();
            await expect(page.getByText(`for ${m}`, { exact: false }).first()).toBeVisible();
            for (const g of ['Case', 'Finish'] as const) {
              const chips = optionGroup(page, g).getByRole('button');
              const n = await chips.count();
              for (let i = 0; i < n; i++) {
                await chips.nth(i).click();
                v = await expectPrice(page, p, `${m} ${g} ${i}`, { size: m });
                await expectComposed(page, seen, p, v);
              }
            }
            log.push(`${m}: ${p.variants.filter((x) => x.attributes.size === m).length} variants, chips ok, composed`);
          }
        }
        if (p.key !== 'phoneCase') {
          for (const g of GROUPS) {
            const chips = optionGroup(page, g).getByRole('button');
            const n = await chips.count();
            for (let i = 0; i < n; i++) {
              const label = (await chips.nth(i).innerText()).split('\n')[0]!.trim();
              await chips.nth(i).click();
              await expect(chips.nth(i)).toHaveAttribute('aria-pressed', 'true');
              v = await expectPrice(page, p, `${g}=${label}`);
              await expectComposed(page, seen, p, v);
              log.push(`${g}=${label} → ${v.sku} ${gbp(v.pricePence)} composed`);
            }
          }
        }
        results[`${vp.name}:${p.key}`] = log;
        } catch (e) {
          // keep sweeping: one product's failure is reported with the rest
          failures.push(`${p.key}: ${String((e as Error).message).split(BR).slice(0, 6).join(' | ')}`);
          results[`${vp.name}:${p.key}`] = [...log, `FAILED: ${failures.at(-1)}`];
          await page.screenshot({ path: `${SHOTS}/${vp.name}-${p.key}-FAILED.jpg`, type: 'jpeg', quality: 55 }).catch(() => {});
          await page.goto('/start-creating').catch(() => {});
        }
      }
      writeFileSync(`${SHOTS}/every-product-${vp.name}.json`, JSON.stringify(results, null, 1));
      expect(failures, failures.join(BR)).toEqual([]);
    });
  });
}

/**
 * EVERY VARIANT, one by one (desktop): pick its exact chips (size → orientation → colour; a cushion's
 * double-sided square via "image both sides") and check the page lands on THAT variant at its price,
 * with its own preview composed. (Phone cases are covered model by model above.)
 */
test('every variant: select it, its price, its preview (desktop)', async ({ page }) => {
  test.setTimeout(60 * 60_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  const shop = (await shopCatalogue()).filter((p) => !BUILDERS.has(p.key) && p.key !== 'phoneCase');
  const seen = trackComposes(page);
  await quietCookies(page);
  await uploadAndOpenRange(page);
  await rangeReady(page);
  await waitForAsset(page);
  const failures: string[] = [];
  const done: string[] = [];
  for (const p of shop) {
    await goClient(page, `/customize/${p.key}`);
    await expect(page.getByRole('heading', { level: 1, name: p.label, exact: true })).toBeVisible({ timeout: 30_000 });
    for (const v of p.variants) {
      try {
        for (const [g, attr] of [['Size', 'size'], ['Orientation', 'orientation'], ['Colour', 'colour']] as const) {
          const want = v.attributes[attr] ?? (attr === 'orientation' ? 'portrait' : undefined);
          const chips = optionGroup(page, g);
          if (!want || (await chips.count()) === 0) continue;
          await chips.getByRole('button', { name: want, exact: true }).or(chips.getByRole('button', { name: new RegExp('^' + esc(want) + '(\\s|$)') })).first().click();
        }
        if (p.key === 'cushion' && v.attributes.sides) {
          await page.getByRole('button', { name: v.attributes.sides === 'double' ? 'image both sides' : 'white back', exact: true }).click();
        }
        await expect(addButton(page)).toHaveText(new RegExp(`· ${gbp(v.pricePence).replace('.', '\.')}$`));
        await expect.poll(() => seen.some((c) => c.variantId === v.id && c.ok), { message: `${v.sku} composed`, timeout: 60_000 }).toBe(true);
        done.push(v.sku);
      } catch (e) {
        failures.push(`${p.key} ${v.sku}: ${String((e as Error).message).split(BR).slice(0, 4).join(' | ')}`);
      }
    }
  }
  writeFileSync(`${SHOTS}/every-variant-desktop.json`, JSON.stringify({ done, failures }, null, 1));
  expect(failures, failures.join(BR)).toEqual([]);
});
