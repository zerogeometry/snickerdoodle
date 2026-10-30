import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { sql } from './harness';
import { quietCookies } from './helpers';

/**
 * Test sweep 29 Oct (tester 01 — the Studio). Shared bits for the sweep-01 specs: an ASYMMETRIC test
 * drawing (so a flip or a turn shows in the saved print file), opening the Studio from the create page,
 * and a test-only look at what the server saved (the asset row + its derivative in local MinIO) — so a
 * Studio edit can be checked all the way to the file products are printed from.
 */

/** Cream paper; a red square top-left, a blue disc bottom-right, a green bar along the bottom. Shapes
 * only — never a real child's drawing. Big enough to pass the print-quality rule. */
export async function lopsidedArt(): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1800">
    <rect x="180" y="180" width="520" height="520" rx="40" fill="#C8402A"/>
    <circle cx="1300" cy="1250" r="300" fill="#2F5DA8"/>
    <rect x="300" y="1500" width="700" height="140" rx="30" fill="#3F6E29"/>
  </svg>`;
  return sharp({ create: { width: 1800, height: 1800, channels: 4, background: { r: 251, g: 245, b: 233, alpha: 1 } } })
    .composite([{ input: Buffer.from(svg) }])
    .png()
    .toBuffer();
}

export const STAGE = 'canvas[aria-label^="your drawing"]';

/** Upload on the create page (the real control) and wait for the range. */
export async function uploadArt(page: Page, art?: Buffer) {
  await quietCookies(page);
  await page.goto('/start-creating');
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.getByRole('button', { name: /upload a drawing/i }).click()]);
  await chooser.setFiles({ name: 'drawing.png', mimeType: 'image/png', buffer: art ?? (await lopsidedArt()) });
  await expect(page.getByRole('heading', { name: /masterpiece, made real/i })).toBeVisible({ timeout: 30_000 });
}

/** The Studio has its picture drawn (a tap before then is ignored). */
export async function studioReady(page: Page) {
  await expect(page).toHaveURL(/\/studio$/);
  await page.waitForFunction((sel) => {
    const c = document.querySelector(sel) as HTMLCanvasElement | null;
    return !!c && c.width > 0 && c.height > 0;
  }, STAGE);
  await page.waitForTimeout(500);
}

/** Upload, then "edit in studio" from the create page. */
export async function openStudioFromCreate(page: Page, art?: Buffer) {
  await uploadArt(page, art);
  await expect(page.getByRole('status').filter({ hasText: 'making your collection' })).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('button', { name: /edit in studio|fine-tune in studio|back to studio/i }).first().click();
  await studioReady(page);
}

/** The drawing in progress, as the tab holds it (sessionStorage sd_upload). */
export async function tabUpload(page: Page): Promise<{ assetId?: string; kept?: boolean; cutout?: { sourceObjectId: string; oneTap?: boolean; trim?: boolean }; copyOf?: string } | null> {
  return page.evaluate(() => {
    try {
      const raw = sessionStorage.getItem('sd_upload');
      const j = raw ? JSON.parse(raw) : null;
      const u = j?.state?.upload ?? null;
      return u ? { assetId: u.assetId, kept: u.kept, cutout: u.cutout, copyOf: u.copyOf } : null;
    } catch {
      return null;
    }
  });
}

/** A fingerprint of the stage as drawn. */
export const stageHash = async (page: Page) => createHash('sha1').update(await page.locator(STAGE).screenshot()).digest('hex');

/** Click-drag across the stage with a mouse, in fractions of the stage box. */
export async function drag(page: Page, from: [number, number], to: [number, number], steps = 12) {
  const r = (await page.locator(STAGE).boundingBox())!;
  await page.mouse.move(r.x + r.width * from[0], r.y + r.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(r.x + r.width * to[0], r.y + r.height * to[1], { steps });
  await page.mouse.up();
}

/** Where lopsidedArt's picture sits on the screen (page px), found from its red square (180–700 of 1800)
 * in a screenshot of the stage — valid while the picture is unturned and unflipped. */
export async function pictureBox(page: Page): Promise<{ x: number; y: number; side: number }> {
  const r = (await page.locator(STAGE).boundingBox())!;
  const shot = await page.locator(STAGE).screenshot();
  const { data, info } = await sharp(shot).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let x0 = Infinity, y0 = Infinity, x1 = -1;
  for (let y = 0; y < info.height; y++)
    for (let x = 0; x < info.width; x++) {
      const i = (y * info.width + x) * 4;
      if (data[i]! > 170 && data[i + 1]! < 90 && data[i + 2]! < 80) {
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
      }
    }
  if (x1 < 0) throw new Error('no red square on the stage');
  const sx = r.width / info.width; // screenshot px → css px
  const side = ((x1 - x0) * sx * 1800) / 520;
  return { x: r.x + x0 * sx - (180 / 1800) * side, y: r.y + y0 * sx - (180 / 1800) * side, side };
}

// ── what the server saved (test-only, local DB + local MinIO) ──
export async function assetRow(assetId: string) {
  const [row] = await sql()`select id, kept_in_home, studio_doc, moderation_status from assets where id = ${assetId}`;
  return row as { id: string; kept_in_home: boolean; studio_doc: Record<string, unknown> | null; moderation_status: string } | undefined;
}
export async function derivatives(assetId: string): Promise<{ id: string; key: string; object_class: string; sha256: string | null }[]> {
  return (await sql()`select id, key, object_class, sha256 from storage_objects where asset_id = ${assetId} order by key`) as never;
}
let s3: S3Client | null = null;
export async function objectBytes(key: string): Promise<Buffer> {
  s3 ??= new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'eu-west-2',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY!, secretAccessKey: process.env.S3_SECRET_KEY! },
  });
  const out = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
  return Buffer.from(await out.Body!.transformToByteArray());
}
/** The average colour of a region of an image (fractions of its size) — with its alpha. */
export async function regionColour(png: Buffer, box: { x: number; y: number; w: number; h: number }) {
  const img = sharp(png).ensureAlpha();
  const m = await img.metadata();
  const left = Math.round(box.x * m.width!), top = Math.round(box.y * m.height!);
  const width = Math.max(1, Math.round(box.w * m.width!)), height = Math.max(1, Math.round(box.h * m.height!));
  const { data } = await img.extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true });
  let r = 0, g = 0, b = 0, a = 0;
  const n = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i]!;
    g += data[i + 1]!;
    b += data[i + 2]!;
    a += data[i + 3]!;
  }
  return { r: r / n, g: g / n, b: b / n, a: a / n };
}
export const isRed = (c: { r: number; g: number; b: number; a: number }) => c.a > 200 && c.r > 150 && c.g < 110 && c.b < 100;
export const isBlue = (c: { r: number; g: number; b: number; a: number }) => c.a > 200 && c.b > 130 && c.r < 110;
export const isPaper = (c: { r: number; g: number; b: number; a: number }) => c.a > 200 && c.r > 225 && c.g > 220 && c.b > 200;

/** My own database's rate-limit counters — the sweep runs many more magic edits than a person would. */
export async function resetRateLimits() {
  await sql()`delete from rate_limits`;
}
