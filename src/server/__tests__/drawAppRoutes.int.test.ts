import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// The safety checks pass here (like the dev stub): this file is about the journey and its refusals.
vi.mock('@/server/moderation/providers', async (orig) => {
  const real = await orig<typeof import('@/server/moderation/providers')>();
  return { ...real, defaultProviders: () => ({ hash: { isKnownIllegal: async () => false }, classifier: { classify: async () => ({ flagged: false, labels: [] }) }, textReader: { read: async () => [] } }) };
});
// Storage that can be made to fail on demand, the way a missing bucket or encryption permission does.
const storage = vi.hoisted(() => ({ fail: false }));
vi.mock('@/storage', async (orig) => {
  const real = await orig<typeof import('@/storage')>();
  return {
    ...real,
    putObject: async (...args: Parameters<typeof real.putObject>) => {
      if (storage.fail) throw Object.assign(new Error('User: arn:aws:iam::123:role/app is not authorized to perform: kms:GenerateDataKey on originals/secret-key'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
      return real.putObject(...args);
    },
  };
});

import { randomFillSync } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { appAuthCodes, appCheckoutGrants, appTokens, assets, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { seedCatalogue } from '@/server/catalogue';
import type { DbHandle } from '@/server/db';
import { APP_UPLOAD_MAX_BYTES, consumeAppCheckoutGrant } from '@/server/app/api';
import { createAuthCode, exchangeAuthCode, type ConnectRequest } from '@/server/app/link';
import { s256 } from '@/server/app/secrets';
import { deleteObject } from '@/storage';
import { POST as postAsset } from '@/app/api/app/v1/assets/route';
import { DELETE as deleteAssetRoute } from '@/app/api/app/v1/assets/[id]/route';
import { POST as postGrant } from '@/app/api/app/v1/checkout-grants/route';
import { POST as postToken } from '@/app/api/app/v1/token/route';

/**
 * "make it real" → "continue at snickerdoodle", as the ROUTES the app calls (real Requests, real
 * multipart, real Postgres + MinIO) — the sync fix of 13 Nov 2026:
 *  - a print-size drawing in the app's own multipart bytes is kept whole, and gets a pass;
 *  - every way the website says no has its own reason, and leaves ONE line in the server log with the
 *    route, the status and the reason — and nothing personal;
 *  - trouble on OUR side (storage) is a logged 500, never passed off as "a bad picture".
 * The proxy's own body limit is checked against the real server in e2e/draw-app-make-it-real.spec.ts.
 * No real child's image: the "drawings" are made here.
 */
const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const BASE = 'https://snickerdoodle.test/api/app/v1';
const VERIFIER = 'a'.repeat(20) + 'B'.repeat(20) + '-._~xyz';
const REQ: ConnectRequest = { codeChallenge: s256(VERIFIER), state: 'st8', redirectUri: 'https://snickerdoodle.co.uk/app/callback' };

/** The multipart body exactly as the app builds it (draw-app/src/services/snickerdoodle/multipart.ts). */
function appMultipart(fields: Record<string, string>, image: Buffer | null, boundary = '----SnickerdoodleDrawk3J9x0Qw7Zp2LmN4'): { body: Buffer; contentType: string } {
  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) parts.push(Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (image) parts.push(Buffer.from(`--${boundary}\r\ncontent-disposition: form-data; name="image"; filename="drawing.png"\r\ncontent-type: image/png\r\n\r\n`), image, Buffer.from('\r\n'));
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

const smallPng = () => sharp({ create: { width: 600, height: 848, channels: 4, background: { r: 246, g: 196, b: 69, alpha: 1 } } }).png().toBuffer();

/** The app's print size (3000 × 4242) with a quarter of the page in crayon grain, which doesn't compress: 10–20 MB. */
async function printSizePng(): Promise<Buffer> {
  const [w, h] = [3000, 4242];
  const raw = Buffer.alloc(w * h * 4);
  randomFillSync(raw, 0, 13 * 1024 * 1024);
  return sharp(raw, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 3 }).toBuffer();
}

describe.skipIf(!DB || !S3)('Snickerdoodle Draw: the routes behind “make it real” (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  let key: string;
  const made: string[] = [];
  const log: string[] = [];
  const uploadsWere = process.env.DRAW_APP_UPLOADS;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    await seedCatalogue(db);
    const code = await createAuthCode(db, { accountId: ids.samId, familyId: ids.hartleyId, childIds: [ids.oliviaId], req: REQ, sync: { keepsakes: 'none', children: false, progress: false, birthdays: false } });
    const res = await exchangeAuthCode(db, { grantType: 'authorization_code', code, codeVerifier: VERIFIER, redirectUri: REQ.redirectUri, clientId: 'snickerdoodle-draw', userAgent: 'okhttp/4.12.0' });
    if (!res.ok) throw new Error(`link failed: ${res.reason}`);
    key = res.token;
  });
  afterAll(async () => {
    if (uploadsWere === undefined) delete process.env.DRAW_APP_UPLOADS;
    else process.env.DRAW_APP_UPLOADS = uploadsWere;
    if (made.length) {
      // let the after-response safety checks land before their rows go
      for (let i = 0; i < 100; i++) {
        const pending = await db.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, made), eq(assets.moderationStatus, 'PENDING')));
        if (!pending.length) break;
        await new Promise((r) => setTimeout(r, 100));
      }
      for (const o of await db.select().from(storageObjects).where(inArray(storageObjects.assetId, made))) await deleteObject(o.key).catch(() => {});
    }
    if (ids) {
      await db.delete(appCheckoutGrants).where(eq(appCheckoutGrants.familyId, ids.hartleyId));
      await db.delete(appTokens).where(eq(appTokens.accountId, ids.samId));
      await db.delete(appAuthCodes).where(eq(appAuthCodes.accountId, ids.samId));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });
  beforeEach(() => {
    process.env.DRAW_APP_UPLOADS = 'on';
    storage.fail = false;
    log.length = 0;
    vi.spyOn(console, 'warn').mockImplementation((...a: unknown[]) => void log.push(a.map(String).join(' ')));
    vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => void log.push(a.map(String).join(' ')));
  });
  afterEach(() => vi.restoreAllMocks());

  const none = { params: Promise.resolve({}) };
  const auth = () => ({ authorization: `Bearer ${key}` });
  const fields = (over: Record<string, string> = {}) => ({ childId: ids.oliviaId, madeOn: '2026-11-12', source: 'app-screen', trigger: 'manual', ...over });
  async function upload(image: Buffer | null, over: Record<string, string> = {}, headers: Record<string, string> = auth()) {
    const { body, contentType } = appMultipart(fields(over), image);
    const res = await postAsset(new Request(`${BASE}/assets`, { method: 'POST', headers: { ...headers, 'content-type': contentType, 'content-length': String(body.length) }, body: new Uint8Array(body) }), none);
    return { status: res.status, json: (await res.json()) as { reason?: string; assetId?: string; kept?: boolean } };
  }
  async function grant(body: unknown, headers: Record<string, string> = auth()) {
    const res = await postGrant(new Request(`${BASE}/checkout-grants`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify(body) }), none);
    return { status: res.status, json: (await res.json()) as { reason?: string; url?: string; expiresAt?: string } };
  }
  const appLines = () => log.filter((l) => l.startsWith('[app-api]'));

  // ── the happy path ────────────────────────────────────────────────────────────────────────────────

  it('keeps a print-size drawing (3000 × 4242, over 10 MB) sent as the app sends it, whole', async () => {
    const png = await printSizePng();
    expect(png.byteLength).toBeGreaterThan(10 * 1024 * 1024);
    expect(png.byteLength).toBeLessThan(APP_UPLOAD_MAX_BYTES);
    const res = await upload(png, { clientRef: 'drawing-print-1' });
    expect(res).toEqual({ status: 201, json: { assetId: expect.any(String), kept: true } });
    made.push(res.json.assetId!);
    const [row] = await db.select().from(assets).where(eq(assets.id, res.json.assetId!));
    expect(row).toMatchObject({ familyId: ids.hartleyId, visibility: 'FAMILY', keptInHome: true, source: 'app-screen', madeOn: '2026-11-12', childSubjectId: ids.oliviaId, appClientRef: 'drawing-print-1' });
    const [orig] = await db.select().from(storageObjects).where(and(eq(storageObjects.assetId, res.json.assetId!), eq(storageObjects.objectClass, 'ORIGINAL')));
    expect(orig!.contentType).toBe('image/png');
    expect(orig!.byteSize).toBeGreaterThan(10 * 1024 * 1024); // every byte arrived

    // the phone asks again (it never heard back): the same keepsake, nothing new, and no picture needed
    const again = await upload(null, { clientRef: 'drawing-print-1' });
    expect(again).toEqual({ status: 200, json: { assetId: res.json.assetId, kept: true } });
    expect(appLines()).toEqual([]); // nothing was refused, so nothing is logged
  }, 120_000);

  it('make it real: a pass for that drawing on that product, which the same grown-up opens once', async () => {
    const kept = await upload(await smallPng(), { clientRef: 'drawing-small-1', source: 'app-paper' });
    expect(kept.status).toBe(201);
    made.push(kept.json.assetId!);
    const g = await grant({ assetId: kept.json.assetId, productKey: 'framedPrint' });
    expect(g.status).toBe(201);
    expect(Object.keys(g.json).sort()).toEqual(['expiresAt', 'url']); // never a price
    expect(g.json.url).toMatch(/\/app\/checkout\/sdg_[A-Za-z0-9_-]{43}$/);
    expect(await consumeAppCheckoutGrant(db, g.json.url!.split('/').pop()!, ids.samId)).toEqual({ ok: true, assetId: kept.json.assetId, productKey: 'framedPrint' });
    expect(appLines()).toEqual([]);
  });

  // ── every refusal: its own reason, and one log line ───────────────────────────────────────────────

  it('POST /assets: each refusal has its own reason and one log line', async () => {
    const png = await smallPng();
    const cases: [string, () => Promise<{ status: number; json: { reason?: string } }>, number, string][] = [
      ['no key', () => upload(png, {}, {}), 401, 'no-key'],
      ['a key that was never issued', () => upload(png, {}, { authorization: `Bearer sdd_${'x'.repeat(43)}` }), 401, 'link-gone'],
      ['a little one this phone isn’t for', () => upload(png, { childId: ids.maxId }), 422, 'child'],
      ['a child that isn’t there', () => upload(png, { childId: 'b4a3f7a0-0000-4000-8000-000000000000' }), 422, 'child'],
      ['a date that isn’t one', () => upload(png, { madeOn: '12/11/2026' }), 422, 'made-on'],
      ['a source it doesn’t know', () => upload(png, { source: 'web' }), 422, 'source'],
      ['a trigger it doesn’t know', () => upload(png, { trigger: 'whenever' }), 422, 'trigger'],
      ['a drawing id it can’t take', () => upload(png, { clientRef: 'has spaces!' }), 422, 'clientRef'],
      ['no picture in the form', () => upload(null), 422, 'image'],
      ['not a picture', () => upload(Buffer.from('%PDF-1.7 not a drawing')), 415, 'image'],
      ['a picture it can’t read', () => upload(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(4000, 7)])), 422, 'image'],
    ];
    for (const [what, run, status, reason] of cases) {
      log.length = 0;
      const res = await run();
      expect([what, res.status, res.json], what).toEqual([what, status, { reason }]);
      expect(appLines(), what).toHaveLength(1);
      expect(appLines()[0], what).toMatch(new RegExp(`^\\[app-api\\] POST /api/app/v1/assets → ${status} ${reason}( \\(.*\\))?$`));
    }
  });

  it('a body cut short on the way is “body”, not “a bad picture” — and the log says how big it claimed to be', async () => {
    const { body, contentType } = appMultipart(fields(), await smallPng());
    const half = body.subarray(0, Math.floor(body.length / 2));
    const res = await postAsset(new Request(`${BASE}/assets`, { method: 'POST', headers: { ...auth(), 'content-type': contentType, 'content-length': String(body.length) }, body: new Uint8Array(half) }), none);
    expect([res.status, await res.json()]).toEqual([422, { reason: 'body' }]);
    expect(appLines()).toEqual([`[app-api] POST /api/app/v1/assets → 422 body (unreadable form: content-length ${body.length}, multipart/form-data)`]);
  });

  it('over 20 MB is refused before it is read', async () => {
    const res = await postAsset(new Request(`${BASE}/assets`, { method: 'POST', headers: { ...auth(), 'content-type': 'multipart/form-data; boundary=x', 'content-length': String(APP_UPLOAD_MAX_BYTES + 5_000_000) }, body: 'x' }), none);
    expect([res.status, await res.json()]).toEqual([413, { reason: 'too-big' }]);
    expect(appLines()[0]).toMatch(/→ 413 too-big \(content-length \d+\)$/);
  });

  it('uploads not open yet (the Children’s Code switch) is “not-yet”', async () => {
    delete process.env.DRAW_APP_UPLOADS;
    expect(await upload(await smallPng())).toEqual({ status: 403, json: { reason: 'not-yet' } });
    expect(appLines()).toEqual(['[app-api] POST /api/app/v1/assets → 403 not-yet']);
  });

  it('trouble with OUR storage is a logged 500 “server”, never “a bad picture”, and nothing half-made is left', async () => {
    storage.fail = true;
    const before = (await db.select({ id: assets.id }).from(assets).where(eq(assets.familyId, ids.hartleyId))).length;
    const res = await upload(await smallPng(), { clientRef: 'drawing-storage-down' });
    expect(res).toEqual({ status: 500, json: { reason: 'server' } });
    // the error's type and status are logged; its message (which names a role and a key) never is
    expect(appLines()).toEqual(['[app-api] POST /api/app/v1/assets → 500 server (AccessDenied, status 403)']);
    expect((await db.select({ id: assets.id }).from(assets).where(eq(assets.familyId, ids.hartleyId))).length).toBe(before);
    // …and once storage is back, the phone's retry of the same drawing goes through
    storage.fail = false;
    const retry = await upload(await smallPng(), { clientRef: 'drawing-storage-down' });
    expect(retry.status).toBe(201);
    made.push(retry.json.assetId!);
  });

  it('POST /checkout-grants: no pass for a product the shop doesn’t show, a website keepsake, another family’s, or one that’s gone', async () => {
    const kept = await upload(await smallPng(), { clientRef: 'drawing-small-2' });
    made.push(kept.json.assetId!);
    const cases: [string, unknown, Record<string, string>, number, string][] = [
      ['no key', { assetId: kept.json.assetId, productKey: 'framedPrint' }, {}, 401, 'no-key'],
      ['a product the shop doesn’t show', { assetId: kept.json.assetId, productKey: 'hoverboard' }, auth(), 422, 'product'],
      ['no product', { assetId: kept.json.assetId }, auth(), 422, 'product'],
      ['a keepsake the website made', { assetId: ids.assetFamily, productKey: 'framedPrint' }, auth(), 404, 'not-found'],
      ['another family’s keepsake', { assetId: ids.assetBloomFamily, productKey: 'framedPrint' }, auth(), 404, 'not-found'],
      ['junk for an id', { assetId: 'nope', productKey: 'framedPrint' }, auth(), 404, 'not-found'],
    ];
    for (const [what, body, headers, status, reason] of cases) {
      log.length = 0;
      const res = await grant(body, headers);
      expect([what, res.status, res.json], what).toEqual([what, status, { reason }]);
      expect(appLines(), what).toEqual([`[app-api] POST /api/app/v1/checkout-grants → ${status} ${reason}`]);
    }

    // taken out of the keepsake box (here by the phone; the website's delete is the same one): no pass any more
    const del = await deleteAssetRoute(new Request(`${BASE}/assets/${kept.json.assetId}`, { method: 'DELETE', headers: auth() }), { params: Promise.resolve({ id: kept.json.assetId! }) });
    expect(del.status).toBe(204);
    log.length = 0;
    expect(await grant({ assetId: kept.json.assetId, productKey: 'framedPrint' })).toEqual({ status: 404, json: { reason: 'not-found' } });
    // deleting it twice: refused, and the log line holds the route's shape, never the id
    const twice = await deleteAssetRoute(new Request(`${BASE}/assets/${kept.json.assetId}?x=${ids.oliviaId}`, { method: 'DELETE', headers: auth() }), { params: Promise.resolve({ id: kept.json.assetId! }) });
    expect(twice.status).toBe(404);
    expect(appLines()).toEqual(['[app-api] POST /api/app/v1/checkout-grants → 404 not-found', '[app-api] DELETE /api/app/v1/assets/:id → 404 not-found']);
  });

  it('POST /token: a bad code is refused and logged like every other refusal', async () => {
    const res = await postToken(new Request(`${BASE}/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', code: 'sdc_nope', code_verifier: VERIFIER, redirect_uri: REQ.redirectUri, client_id: 'snickerdoodle-draw' }) }));
    expect(res.status).toBe(400);
    expect(appLines()).toHaveLength(1);
    expect(appLines()[0]).toMatch(/^\[app-api\] POST \/api\/app\/v1\/token → 400 invalid-(grant|request)$/);
  });

  it('no log line ever holds the key, an id, a name or an email', async () => {
    log.length = 0;
    const png = await smallPng();
    await upload(png, { childId: ids.maxId });
    await upload(png, {}, { authorization: `Bearer ${key}x` });
    await grant({ assetId: ids.assetBloomFamily, productKey: 'framedPrint' });
    storage.fail = true;
    await upload(png, { clientRef: 'drawing-storage-down-2' });
    const all = log.join('\n');
    expect(appLines().length).toBe(4);
    for (const secret of [key, key.slice(4, 20), ids.maxId, ids.oliviaId, ids.hartleyId, ids.samId, ids.assetBloomFamily, 'Olivia', 'Max', 'Sam', '@', 'arn:aws', 'secret-key', 'drawing-storage-down-2']) expect(all).not.toContain(secret);
  });
});
