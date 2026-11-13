import { randomFillSync, randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { APIRequestContext } from '@playwright/test';
import { test, expect } from './test';
import { customizeReady, quietCookies } from './helpers';
import { hasDb, linkDrawApp, signInByEmailLink, sql, testEmail } from './harness';

/**
 * Snickerdoodle Draw → "make it real" → "continue at snickerdoodle", end to end against the real
 * server (so THROUGH the proxy, which is where a big drawing used to be cut off at 10 MB):
 * the phone's key keeps a drawing (POST /api/app/v1/assets, the app's own multipart bytes), asks for
 * a pass (POST /checkout-grants), and the pass opens the maker in the grown-up's browser with that
 * drawing on that product. No real child's art: the "drawings" are made here.
 */
test.skip(!hasDb, 'needs DATABASE_URL + AUTH_SECRET (.env)');
test.use({ viewport: { width: 390, height: 844 } }); // a phone: this journey starts on one

const API = '/api/app/v1';

/** The multipart body exactly as the app builds it (draw-app/src/services/snickerdoodle/multipart.ts). */
function appMultipart(fields: Record<string, string>, png: Buffer): { body: Buffer; contentType: string } {
  const boundary = `----SnickerdoodleDraw${randomUUID().replace(/-/g, '')}`;
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  parts.push(Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="image"; filename="drawing.png"\r\ncontent-type: image/png\r\n\r\n`), png, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** A small drawing on a clear page. */
const smallDrawing = () =>
  sharp({ create: { width: 1200, height: 1697, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1697"><circle cx="600" cy="700" r="380" fill="#F6C445"/><rect x="300" y="1150" width="600" height="300" rx="60" fill="#2F5DA8"/></svg>`) }])
    .png()
    .toBuffer();

/**
 * A print-size page (3000 × 4242, the app's PRINT_PX) heavy with crayon grain: grain doesn't compress,
 * so the PNG lands between 10 MB (where the proxy used to cut a body off) and the 20 MB upload cap.
 */
async function bigCrayonDrawing(): Promise<Buffer> {
  const [w, h] = [3000, 4242];
  const raw = Buffer.alloc(w * h * 4); // a clear page…
  randomFillSync(raw, 0, 13 * 1024 * 1024); // …with the top quarter scribbled solid in "crayon"
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 3 }).toBuffer();
}

const today = () => new Date().toISOString().slice(0, 10);

async function keep(request: APIRequestContext, key: string, childId: string, png: Buffer, clientRef: string) {
  const { body, contentType } = appMultipart({ childId, madeOn: today(), source: 'app-screen', trigger: 'manual', clientRef }, png);
  return request.post(`${API}/assets`, { headers: { authorization: `Bearer ${key}`, 'content-type': contentType, accept: 'application/json' }, data: body, timeout: 120_000 });
}
const grant = (request: APIRequestContext, key: string, assetId: string, productKey: string) =>
  request.post(`${API}/checkout-grants`, { headers: { authorization: `Bearer ${key}` }, data: { assetId, productKey } });

/** The e2e server has no real screening, so it holds every picture; stand in for the classifier's "clean" (e2e/test.ts). */
async function screenedClean(assetId: string) {
  await expect.poll(async () => (await sql()`select moderation_status from assets where id = ${assetId}`)[0]?.moderation_status, { timeout: 30_000 }).not.toBe('PENDING');
  await sql()`update assets set moderation_status = 'CLEAR' where id = ${assetId}`;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('make it real: the phone keeps a print-size drawing, and its pass opens the maker with it, signed in or not', async ({ page, request, browser }) => {
  test.setTimeout(240_000);
  await quietCookies(page);
  const email = testEmail('draw');
  await signInByEmailLink(page, email, '/home');
  await expect(page).toHaveURL(/\/home/);
  const phone = await linkDrawApp(email);

  // ── keep it: a small drawing, then a print-size one over 10 MB ─────────────────────────────────
  const first = await keep(request, phone.key, phone.childId, await smallDrawing(), 'e2e-small-1');
  test.skip(first.status() === 403 && (await first.json()).reason === 'not-yet', 'this e2e server was started without DRAW_APP_UPLOADS=on (playwright.config.ts sets it; restart the server)');
  expect(first.status(), await first.text()).toBe(201);

  const big = await bigCrayonDrawing();
  expect(big.byteLength).toBeGreaterThan(10 * 1024 * 1024);
  expect(big.byteLength).toBeLessThan(20 * 1024 * 1024);
  const kept = await keep(request, phone.key, phone.childId, big, 'e2e-big-1');
  expect(kept.status(), await kept.text()).toBe(201);
  const { assetId } = (await kept.json()) as { assetId: string };
  // every byte arrived: what's stored is the whole print-size page
  const [stored] = await sql()`select byte_size from storage_objects where asset_id = ${assetId} and object_class = 'ORIGINAL'`;
  expect(Number(stored!.byte_size)).toBeGreaterThan(10 * 1024 * 1024);

  // the phone trying again (it never heard back) gets the same keepsake, not a second one
  const again = await keep(request, phone.key, phone.childId, big, 'e2e-big-1');
  expect(again.status()).toBe(200);
  expect(((await again.json()) as { assetId: string }).assetId).toBe(assetId);

  // ── make it real, already signed in on the website ─────────────────────────────────────────────
  await screenedClean(assetId);
  const g1 = await grant(request, phone.key, assetId, 'framedPrint');
  expect(g1.status(), await g1.text()).toBe(201);
  const pass1 = new URL(((await g1.json()) as { url: string }).url).pathname;
  expect(pass1).toMatch(/^\/app\/checkout\/sdg_[A-Za-z0-9_-]{43}$/);
  await page.goto(pass1);
  await expect(page).toHaveURL(/\/customize\/framedPrint/, { timeout: 60_000 });
  await customizeReady(page);

  // a pass works once: the same link again says so kindly, and points back to the app
  await page.goto(pass1);
  await expect(page.getByRole('heading', { name: 'that link has had its moment' })).toBeVisible();

  // ── make it real in a browser that isn't signed in: sign in, then straight on to the maker ─────
  const g2 = await grant(request, phone.key, assetId, 'kidsTee');
  const pass2 = new URL(((await g2.json()) as { url: string }).url).pathname;
  const fresh = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await fresh.newPage();
  await quietCookies(p2);
  await p2.goto(pass2);
  await expect(p2).toHaveURL(new RegExp(`/login\\?next=${escapeRe(encodeURIComponent(pass2))}`));
  await signInByEmailLink(p2, email, pass2); // the email link carries them on to the pass
  await expect(p2).toHaveURL(/\/customize\/kidsTee/, { timeout: 60_000 });
  await customizeReady(p2);
  await fresh.close();

  // ── what the phone is told when it can't go ahead ──────────────────────────────────────────────
  const noProduct = await grant(request, phone.key, assetId, 'hoverboard');
  expect([noProduct.status(), (await noProduct.json()).reason]).toEqual([422, 'product']);
  const noKey = await request.post(`${API}/checkout-grants`, { data: { assetId, productKey: 'framedPrint' } });
  expect(noKey.status()).toBe(401);
  // taken out of the keepsake box on the website: no pass for it any more (the app explains; it never re-sends by itself)
  const del = await request.delete(`${API}/assets/${assetId}`, { headers: { authorization: `Bearer ${phone.key}` } });
  expect(del.status()).toBe(204);
  const gone = await grant(request, phone.key, assetId, 'framedPrint');
  expect([gone.status(), (await gone.json()).reason]).toEqual([404, 'not-found']);
});
