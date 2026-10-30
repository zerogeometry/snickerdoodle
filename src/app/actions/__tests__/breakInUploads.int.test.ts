import { afterAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import sharp from 'sharp';

/**
 * BREAK-IN SWEEP (tester 07, 2026-10-29) — hostile uploads through the REAL guest upload action
 * (startGuestUpload), then the bytes actually STORED in the private bucket are inspected. Existing
 * unit tests cover stripExif alone (src/storage/__tests__); this pins the whole ingest path.
 */

const jar = vi.hoisted(() => ({ set: vi.fn(), get: () => undefined, delete: vi.fn(), getAll: () => [] }));
vi.mock('next/headers', () => ({ cookies: async () => jar, headers: async () => new Headers({ 'x-real-ip': '203.0.113.79' }) }));
vi.mock('@/server/rateLimit', async (orig) => ({
  ...(await orig<typeof import('@/server/rateLimit')>()),
  clientIp: async () => '203.0.113.79',
  rateLimit: vi.fn(async () => ({ ok: true, retryAfterSec: 0 })),
}));

import { assets, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { startGuestUpload } from '@/app/actions/guestUpload';
import { deleteObject, getObjectBytes } from '@/storage';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;

const form = (bytes: Buffer, name: string, type: string) => {
  const f = new FormData();
  f.set('termsAccepted', 'true');
  f.set('image', new File([new Uint8Array(bytes)], name, { type }));
  return f;
};
const drawing = () =>
  sharp({ create: { width: 1200, height: 900, channels: 3, background: '#fbf5e9' } })
    .composite([{ input: { create: { width: 500, height: 400, channels: 3, background: '#c8402a' } }, left: 300, top: 250 }]);

describe.skipIf(!DB || !S3)('break-in: hostile uploads (integration, real ingest + storage)', () => {
  const db = getDb() as unknown as import('@/server/db').DbHandle;
  const stored: string[] = [];
  const keep = async (assetId: string) => {
    const [o] = await db.select().from(storageObjects).where(eq(storageObjects.assetId, assetId));
    stored.push(o!.key);
    return { row: o!, bytes: await getObjectBytes(o!.key) };
  };

  afterAll(async () => {
    for (const k of stored) await deleteObject(k).catch(() => {});
  });

  it('a photo carrying GPS + camera EXIF is stored with NO metadata at all', async () => {
    const withGps = await drawing()
      .jpeg()
      .withExif({
        IFD0: { Make: 'T7Cam', Model: 'Leaky 1', Copyright: 'home address 1 Example Road' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 0/1' },
      })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif, 'the fixture really has EXIF').toBeTruthy();
    const res = await startGuestUpload(form(withGps, 'photo.jpg', 'image/jpeg'));
    expect(res).toMatchObject({ ok: true });
    const { row, bytes } = await keep((res as { assetId: string }).assetId);
    const meta = await sharp(bytes).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(bytes.includes(Buffer.from('T7Cam'))).toBe(false);
    expect(bytes.includes(Buffer.from('Example Road'))).toBe(false);
    expect(row.exifStripped).toBe(true);
  });

  it('not an image (text with an image name + type) is refused and nothing is stored', async () => {
    const before = (await db.select({ id: assets.id }).from(assets)).length;
    const res = await startGuestUpload(form(Buffer.from('hello, I am not a picture'), 'drawing.png', 'image/png'));
    expect(res).toMatchObject({ ok: false });
    expect((await db.select({ id: assets.id }).from(assets)).length).toBe(before);
  });

  it('an SVG with a <script> is never stored or served as SVG — it is flattened to pixels', async () => {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><script>alert(document.cookie)</script>
      <rect width="1200" height="900" fill="#2f5da8"/><foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml" onclick="alert(1)">x</div></foreignObject></svg>`);
    const res = await startGuestUpload(form(svg, 'drawing.svg', 'image/svg+xml'));
    if (!res.ok) return; // refusing SVG outright is also fine
    const { row, bytes } = await keep((res as { assetId: string }).assetId);
    expect(row.contentType).not.toMatch(/svg/);
    expect(bytes.includes(Buffer.from('<script'))).toBe(false);
    expect(bytes.includes(Buffer.from('<svg'))).toBe(false);
    expect((await sharp(bytes).metadata()).format).not.toBe('svg');
    // 07-B17: stored as what the bytes ARE — a PNG — never application/octet-stream
    expect((await sharp(bytes).metadata()).format).toBe('png');
    expect(row.contentType).toBe('image/png');
  });

  it('an SVG that points at a file on the server does not pull that file into the picture', async () => {
    const local = path.resolve('public/brand').replace(/\\/g, '/');
    const blank = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="400" height="400"><rect width="400" height="400" fill="#ffffff"/>`;
    const withRef = Buffer.from(`${blank}<image x="0" y="0" width="400" height="400" xlink:href="file:///${local}/../favicon.ico" href="file:///C:/Windows/win.ini"/></svg>`);
    const plain = Buffer.from(`${blank}</svg>`);
    const res = await startGuestUpload(form(withRef, 'x.svg', 'image/svg+xml'));
    if (!res.ok) return;
    const { bytes } = await keep((res as { assetId: string }).assetId);
    const a = await sharp(bytes).raw().toBuffer();
    const b = await sharp(await sharp(plain).png().toBuffer()).raw().toBuffer();
    expect(a.equals(b), 'the referenced file was not rendered').toBe(true);
  });

  it('a polyglot (valid PNG + an HTML/script payload after IEND) is re-encoded: the payload is gone', async () => {
    const png = await drawing().png().toBuffer();
    const poly = Buffer.concat([png, Buffer.from('<html><script>alert(1)</script></html>PK\x03\x04zip-tail')]);
    const res = await startGuestUpload(form(poly, 'drawing.png', 'image/png'));
    expect(res).toMatchObject({ ok: true });
    const { row, bytes } = await keep((res as { assetId: string }).assetId);
    expect(bytes.includes(Buffer.from('<script'))).toBe(false);
    expect(bytes.includes(Buffer.from('zip-tail'))).toBe(false);
    expect(row.contentType).toBe('image/png');
  });

  it('the declared type is ignored: JPEG bytes sent as image/png are stored as what they really are', async () => {
    const jpeg = await drawing().jpeg().toBuffer();
    const res = await startGuestUpload(form(jpeg, 'drawing.png', 'image/png'));
    expect(res).toMatchObject({ ok: true });
    const { row } = await keep((res as { assetId: string }).assetId);
    expect(row.contentType).toBe('image/jpeg');
  });

  it('a decompression bomb (tiny file claiming 30000×30000) is refused without decoding', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#c8402a' } }).png().toBuffer();
    const bomb = Buffer.from(png);
    bomb.writeUInt32BE(30000, 16);
    bomb.writeUInt32BE(30000, 20);
    expect(await startGuestUpload(form(bomb, 'drawing.png', 'image/png'))).toMatchObject({ ok: false });
  });

  it('a file over 25MB is refused before it is read', async () => {
    const big = Buffer.alloc(25 * 1024 * 1024 + 1, 0x41);
    expect(await startGuestUpload(form(big, 'drawing.png', 'image/png'))).toMatchObject({ ok: false });
  });

  it('no terms → refused; a zero-byte file → refused', async () => {
    const f = form(await drawing().png().toBuffer(), 'd.png', 'image/png');
    f.set('termsAccepted', 'yes');
    expect(await startGuestUpload(f)).toMatchObject({ ok: false, needsTerms: true });
    expect(await startGuestUpload(form(Buffer.alloc(0), 'd.png', 'image/png'))).toMatchObject({ ok: false });
  });
});
