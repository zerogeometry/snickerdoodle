import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { assets, storageObjects } from '@/db/schema';
import type { ViewerContext } from '@/authz';
import { deleteObjectConfirmed, derivativeKey, getObjectBytes, getS3, putObject } from '@/storage';
import { getViewableAssetOrThrow } from './assets';
import type { DbHandle } from './db';
import { applyCutoutMask, cutoutAlphaForAsset, workingBytes } from './magic';
import { cleanLayerLook, cleanObjects, layerAlpha, objectText, type LayerLook, type StudioObject } from '@/lib/studio-objects';
import { renderStudioObjects } from './print/studioOverlay';
import { cleanPlace, normAngle, placeIsIdentity, rotatedSize, type Placement } from '@/lib/studio-geometry';
import { applyLook, cleanLook, type StudioLook } from '@/lib/studio-look';
import { cleanMagic, tidyWindow, type MagicEdits } from '@/lib/studio-magic';
import { containsAbusiveText } from './textSafety';
import { clearDesignModeration, moderateDesignAndRecord, type ModerationProviders } from './moderation';

/** Small designs are scaled up to this longest edge before added things are drawn, so text and
 * pen lines are crisp on big prints (the print path would upscale the picture anyway). */
const OVERLAY_EDGE = 3000;
/** The most a design is ever enlarged for crisp added things. */
export const DESIGN_MAX_ENLARGE = 4;

/**
 * The design's REAL pixel size — the drawing's own pixels across it, before any enlarging for
 * crisp overlays (and divided by any scaling-up of the drawing inside its frame). Stored with the
 * design's content hash, so the print-quality gate judges the drawing, never the enlarged file
 * (src/server/print/upscale.ts printSourceDims).
 */
export interface DesignPx {
  width: number;
  height: number;
  sha256: string;
}

/**
 * The Studio's non-destructive recipe (Studio spec §16 "always-recoverable original"). Geometry is
 * applied in a fixed order — ROTATE (any angle clockwise; the frame grows to fit) → FLIP
 * (horizontal, then vertical) → PLACE (the unlocked drawing's position / size / turn in the frame)
 * → CROP (a rectangle, 0–1 fractions of the frame) — identically here and in the browser
 * (src/lib/studio-geometry.ts), so what the parent sees is what prints.
 */
export interface StudioGeometry {
  /** Degrees clockwise, 0 ≤ r < 360, to a tenth of a degree. */
  rotate: number;
  flipH: boolean;
  flipV: boolean;
  crop: { x: number; y: number; w: number; h: number };
  /** Fill for the see-through parts (#rrggbb), or null = leave see-through. */
  background: string | null;
  /** The unlocked drawing's placement in the frame; null = as rotated into it. */
  place?: Placement | null;
}

export const IDENTITY_GEOMETRY: StudioGeometry = { rotate: 0, flipH: false, flipV: false, crop: { x: 0, y: 0, w: 1, h: 1 }, background: null, place: null };

/** Validate + clamp a client-sent geometry (never trust the client). */
export function cleanGeometry(raw: unknown): StudioGeometry {
  const g = (raw ?? {}) as Partial<StudioGeometry>;
  const rotate = typeof g.rotate === 'number' && Number.isFinite(g.rotate) ? normAngle(g.rotate) : 0;
  const c = g.crop ?? IDENTITY_GEOMETRY.crop;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  let x = Math.min(0.98, Math.max(0, num(c.x, 0)));
  let y = Math.min(0.98, Math.max(0, num(c.y, 0)));
  const w = Math.min(1 - x, Math.max(0.02, num(c.w, 1)));
  const h = Math.min(1 - y, Math.max(0.02, num(c.h, 1)));
  x = Math.min(x, 1 - w);
  y = Math.min(y, 1 - h);
  const background = typeof g.background === 'string' && /^#[0-9a-f]{6}$/i.test(g.background) ? g.background.toLowerCase() : null;
  return { rotate, flipH: g.flipH === true, flipV: g.flipV === true, crop: { x, y, w, h }, background, place: cleanPlace(g.place) };
}

export const isIdentity = (g: StudioGeometry) =>
  !g.background &&
  placeIsIdentity(g.place) &&
  g.rotate === 0 && !g.flipH && !g.flipV && g.crop.x <= 0.0005 && g.crop.y <= 0.0005 && g.crop.w >= 0.9995 && g.crop.h >= 0.9995;

/** Apply the recipe's geometry to an image (any size) — the server half of the shared contract. */
export async function applyGeometry(input: Buffer, g: StudioGeometry): Promise<{ buffer: Buffer; width: number; height: number }> {
  const src = await sharp(input).metadata();
  const [fw, fh] = rotatedSize(src.width!, src.height!, g.rotate);
  const W = Math.max(1, Math.round(fw)), H = Math.max(1, Math.round(fh));
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  let buf = input;
  if (g.rotate) {
    buf = await sharp(input).ensureAlpha().rotate(g.rotate, { background: clear }).png().toBuffer();
    // a free turn's bounding box can land a pixel off the shared maths — pin it to the frame size
    const m = await sharp(buf).metadata();
    if (m.width !== W || m.height !== H) buf = await sharp(buf).resize(W, H, { fit: 'fill' }).png().toBuffer();
  }
  if (g.flipH) buf = await sharp(buf).flop().png().toBuffer();
  if (g.flipV) buf = await sharp(buf).flip().png().toBuffer();
  if (!placeIsIdentity(g.place)) buf = await placeInFrame(buf, W, H, g.place!);
  const left = Math.round(g.crop.x * W), top = Math.round(g.crop.y * H);
  const width = Math.max(1, Math.min(W - left, Math.round(g.crop.w * W)));
  const height = Math.max(1, Math.min(H - top, Math.round(g.crop.h * H)));
  const out = await sharp(buf).extract({ left, top, width, height }).png({ compressionLevel: 6 }).toBuffer();
  return { buffer: out, width, height };
}

/** The unlocked drawing, sized + turned about its centre and set at its place on a clear W×H frame. */
async function placeInFrame(drawing: Buffer, W: number, H: number, p: Placement): Promise<Buffer> {
  const clear = { r: 0, g: 0, b: 0, alpha: 0 };
  const sw = Math.max(1, Math.round(W * p.scale)), sh = Math.max(1, Math.round(H * p.scale));
  let layer = await sharp(drawing).ensureAlpha().resize(sw, sh, { fit: 'fill' }).png().toBuffer();
  if (p.angle) layer = await sharp(layer).rotate(p.angle, { background: clear }).png().toBuffer();
  const m = await sharp(layer).metadata();
  const lw = m.width!, lh = m.height!;
  const left = Math.round(p.x * W - lw / 2), top = Math.round(p.y * H - lh / 2);
  // only the part inside the frame
  const x0 = Math.max(0, left), y0 = Math.max(0, top), x1 = Math.min(W, left + lw), y1 = Math.min(H, top + lh);
  const frame = sharp({ create: { width: W, height: H, channels: 4, background: clear } });
  if (x1 <= x0 || y1 <= y0) return frame.png().toBuffer();
  const part = await sharp(layer).extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 }).png().toBuffer();
  return frame.composite([{ input: part, left: x0, top: y0 }]).png().toBuffer();
}

/** Colour & light + a preset look, on the drawing's own pixels (alpha untouched) — the server half of
 * src/lib/studio-look.ts, the same function the browser previews with. */
export async function applyLookToImage(input: Buffer, look: StudioLook | null, layer: LayerLook | null = null): Promise<Buffer> {
  const alpha = layer ? layerAlpha(layer) : 1;
  if (!look && alpha >= 1) return input;
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  applyLook(data, 4, look);
  // the drawing layer faded / hidden (like the browser's globalAlpha on it)
  if (alpha < 1) for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i]! * alpha);
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png({ compressionLevel: 6 }).toBuffer();
}

/**
 * The self-hosted magic edits on the drawing's own pixels (alpha untouched): "tidy the lines" = a
 * median smoothing sized to the picture + paper cleaned toward white; "brighten" = a LIFT-ONLY
 * tone lift (see brightenPixels) with a touch more colour. Deterministic sharp, in-process — no
 * third party sees the image.
 */
/**
 * "brighten", in place on raw RGB: the paper (the brightest common tone of the visible pixels,
 * 97th percentile of luminance) is lifted to near-white by one gain ≥ 1, then the midtones get a
 * gentle lift (gamma 0.9). Both steps only ever RAISE a value — a drawing never comes out darker
 * (a contrast stretch would push its darkest 1% to black). Alpha decides what's "visible".
 */
export function brightenPixels(px: Buffer | Uint8Array, alpha: Buffer | Uint8Array): void {
  const hist = new Uint32Array(256);
  let total = 0;
  for (let i = 0, k = 0; i + 2 < px.length; i += 3, k++) {
    if (alpha[k] !== undefined && alpha[k]! <= 128) continue;
    hist[Math.round(0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!)]!++;
    total++;
  }
  if (total === 0) return;
  let seen = 0, paper = 255;
  for (let v = 0; v < 256; v++) {
    seen += hist[v]!;
    if (seen >= total * 0.97) {
      paper = v;
      break;
    }
  }
  const gain = Math.min(1.8, Math.max(1, 252 / Math.max(paper, 1)));
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(v, Math.min(255, Math.round(255 * Math.pow(Math.min(1, (v * gain) / 255), 0.9))));
  for (let i = 0; i < px.length; i++) px[i] = lut[px[i]!]!;
}

export async function applyMagicToImage(input: Buffer, magic: MagicEdits | null): Promise<Buffer> {
  if (!magic) return input;
  const meta = await sharp(input).metadata();
  const W = meta.width!, H = meta.height!;
  const alpha = await sharp(input).ensureAlpha().extractChannel(3).raw().toBuffer();
  let rgb = await sharp(input).removeAlpha().png().toBuffer();
  if (magic.tidy) rgb = await sharp(rgb).median(tidyWindow(Math.max(W, H))).png().toBuffer();
  if (magic.brighten) {
    const { data, info } = await sharp(rgb).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    brightenPixels(data, alpha);
    rgb = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).modulate({ saturation: 1.08 }).png().toBuffer();
  }
  const px = await sharp(rgb).removeAlpha().raw().toBuffer();
  if (magic.tidy) {
    // the paper → white. Paper = the picture's own brightest common, near-neutral tone (so a dim
    // photo's grey paper counts too); a soft ramp below it, so pale crayon survives, and nothing
    // colourful is ever touched. A painting with no light paper is left alone.
    const hist = new Uint32Array(256);
    for (let i = 0, k = 0; i + 2 < px.length; i += 3, k++) if (alpha[k]! > 128) hist[Math.min(px[i]!, px[i + 1]!, px[i + 2]!)]!++;
    let total = 0;
    for (const n of hist) total += n;
    let seen = 0, paper = 255;
    for (let v = 0; v < 256; v++) {
      seen += hist[v]!;
      if (seen >= total * 0.9) {
        paper = v;
        break;
      }
    }
    if (paper >= 170) {
      const lo = paper - 32, hi = paper - 6;
      for (let i = 0; i + 2 < px.length; i += 3) {
        const m = Math.min(px[i]!, px[i + 1]!, px[i + 2]!);
        if (m <= lo || Math.max(px[i]!, px[i + 1]!, px[i + 2]!) - m > 36) continue;
        const t = Math.min(1, (m - lo) / (hi - lo));
        const k = t * t * (3 - 2 * t);
        for (let c = 0; c < 3; c++) px[i + c] = Math.round(px[i + c]! + (255 - px[i + c]!) * k);
      }
    }
  }
  return sharp(px, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * The magic edits on the editing copy (w×h, the browser's own size), for the live preview — the
 * same function as the print, run on the original's pixels at that size (alpha left to the browser).
 */
export async function magicPreviewForAsset(db: DbHandle, viewer: ViewerContext, assetId: string, magic: MagicEdits | null, w: number, h: number): Promise<Buffer> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const W = Math.round(Math.min(2000, Math.max(1, w))), H = Math.round(Math.min(2000, Math.max(1, h)));
  const orig = await bytesOf(db, assetId, 'ORIGINAL');
  if (!orig) throw new Error('no original');
  const small = await sharp(orig).rotate().resize(W, H, { fit: 'fill' }).ensureAlpha().png().toBuffer();
  const out = await applyMagicToImage(small, magic);
  return sharp(out).removeAlpha().png().toBuffer();
}

/** The recipe as stored: geometry at the top level (older docs are just that), then the rest. */
const docOf = (g: StudioGeometry, objects: StudioObject[], look: StudioLook | null, drawing: LayerLook | null, magic: MagicEdits | null = null) => ({
  ...g,
  objects,
  ...(magic ? { magic } : {}),
  ...(look ? { look } : {}),
  ...(drawing ? { drawing } : {}),
});

async function bytesOf(db: DbHandle, assetId: string, which: 'ORIGINAL' | 'cutout'): Promise<Buffer | null> {
  if (which === 'ORIGINAL') {
    // the drawing the Studio edits: the table-trimmed copy when there is one (src/server/magic.ts)
    return workingBytes(db, assetId).catch(() => null);
  }
  const key = derivativeKey(assetId, 'cutout');
  const [o] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  return o ? getObjectBytes(key) : null;
}

/** Reopen the Studio where the parent left it: the recipe + the current transparency mask. */
export async function studioStateForAsset(
  db: DbHandle,
  viewer: ViewerContext,
  assetId: string,
): Promise<{ geometry: StudioGeometry; objects: StudioObject[]; look: StudioLook | null; drawing: LayerLook | null; magic: MagicEdits | null; mask: Buffer | null }> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, assetId));
  const geometry = row?.doc ? cleanGeometry(row.doc) : IDENTITY_GEOMETRY;
  const objects = row?.doc ? cleanObjects((row.doc as { objects?: unknown }).objects) : [];
  const look = row?.doc ? cleanLook((row.doc as { look?: unknown }).look) : null;
  const drawing = row?.doc ? cleanLayerLook((row.doc as { drawing?: unknown }).drawing) : null;
  const magic = row?.doc ? cleanMagic((row.doc as { magic?: unknown }).magic) : null;
  return { geometry, objects, look, drawing, magic, mask: await cutoutAlphaForAsset(db, viewer, assetId) };
}

/** Typed words that fail the abuse screen (user text is screened before it can print). */
export class StudioTextError extends Error {}

export interface StudioSaveResult {
  /** The design to render products from (null = the untouched original). */
  sourceObjectId: string | null;
  objectKey: string | null;
  /** The design's width/height, for auto-orienting product tiles. */
  aspect: number;
  /** A design's REAL pixel size (what print quality is judged on) — absent when it's the original or cutout. */
  realPx?: { width: number; height: number };
}

/**
 * Save the Studio: the transparency mask (if the parent removed / erased / brought back anything)
 * becomes the cutout, then the geometry is applied to the cutout (or the original) at FULL
 * resolution and stored as the 'design' derivative products are made from. The original is never
 * changed; the recipe is stored so the Studio reopens exactly as it was left.
 */
export async function saveStudio(
  db: DbHandle,
  viewer: ViewerContext,
  assetId: string,
  input: { mask: Buffer | null; geometry: StudioGeometry; objects?: unknown; look?: unknown; drawing?: unknown; magic?: unknown; clearCutout?: boolean },
  deps: { moderation?: ModerationProviders } = {},
): Promise<StudioSaveResult> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const g = cleanGeometry(input.geometry);
  const objects = cleanObjects(input.objects);
  const look = cleanLook(input.look);
  const drawing = cleanLayerLook(input.drawing);
  const magic = cleanMagic(input.magic);
  if (objectText(objects).some((t) => containsAbusiveText(t))) throw new StudioTextError('text not allowed');
  if (input.mask) await applyCutoutMask(db, viewer, assetId, input.mask);
  if (input.clearCutout) await dropDerivative(db, assetId, 'cutout');
  await db.update(assets).set({ studioDoc: docOf(g, objects, look, drawing, magic) }).where(eq(assets.id, assetId));

  const cut = input.clearCutout ? null : await bytesOf(db, assetId, 'cutout');
  const source = cut ?? (await bytesOf(db, assetId, 'ORIGINAL'));
  if (!source) throw new Error('no original to edit');

  const plain = isIdentity(g) && objects.length === 0 && !look && !drawing && !magic;
  if (!cut && plain) {
    await dropDerivative(db, assetId, 'design'); // back to the plain original — no stale design left behind
    await clearDesignModeration(db, assetId);
    const meta = await sharp(source).rotate().metadata();
    return { sourceObjectId: null, objectKey: null, aspect: (meta.width ?? 1) / (meta.height ?? 1) };
  }
  if (cut && plain) {
    await dropDerivative(db, assetId, 'design'); // the cutout IS the design now
    await clearDesignModeration(db, assetId);
    const key = derivativeKey(assetId, 'cutout');
    const [o] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
    const meta = await sharp(cut).metadata();
    return { sourceObjectId: o!.id, objectKey: key, aspect: (meta.width ?? 1) / (meta.height ?? 1) };
  }

  // originals: honour orientation first; then colour & light, on the drawing's own pixels
  // magic edits first (the drawing tidied / brightened), then colour & light — as previewed
  const base = await applyLookToImage(await applyMagicToImage(cut ?? (await sharp(source).rotate().png().toBuffer()), magic), look, drawing);
  const baseMeta = await sharp(base).metadata();
  const [gwF, ghF] = rotatedSize(baseMeta.width!, baseMeta.height!, g.rotate);
  const GW = Math.max(1, Math.round(gwF)), GH = Math.max(1, Math.round(ghF));
  let designed = await applyGeometry(base, g);
  // the drawing's own detail across the design (a drawing scaled up in its frame spreads it thinner)
  const spread = Math.max(1, g.place?.scale ?? 1);
  const real = { width: Math.max(1, Math.round(designed.width / spread)), height: Math.max(1, Math.round(designed.height / spread)) };
  // Added things: draw them at a resolution that stays crisp in print.
  let k = 1;
  if (objects.length) {
    k = Math.min(DESIGN_MAX_ENLARGE, Math.max(1, OVERLAY_EDGE / Math.max(designed.width, designed.height)));
    if (k > 1) {
      const w = Math.round(designed.width * k), h = Math.round(designed.height * k);
      designed = { buffer: await sharp(designed.buffer).resize(w, h, { kernel: 'lanczos3' }).png().toBuffer(), width: w, height: h };
    }
  }
  if (g.background) {
    // a filled background: the see-through parts become that colour, at full resolution
    const filled = await sharp(designed.buffer).flatten({ background: g.background }).png({ compressionLevel: 6 }).toBuffer();
    designed = { ...designed, buffer: filled };
  }
  if (objects.length) {
    const gw = GW * k, gh = GH * k;
    const buffer = await renderStudioObjects(designed.buffer, { gw, gh, cropX: Math.round(g.crop.x * GW) * k, cropY: Math.round(g.crop.y * GH) * k }, objects);
    designed = { ...designed, buffer };
  }
  const key = derivativeKey(assetId, 'design');
  await putObject(key, designed.buffer, 'image/png');
  const sha256 = createHash('sha256').update(designed.buffer).digest('hex');
  const [existing] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  let objectId: string;
  if (existing) {
    await db.update(storageObjects).set({ byteSize: designed.buffer.byteLength, sha256 }).where(eq(storageObjects.id, existing.id));
    objectId = existing.id;
  } else {
    const [row] = await db
      .insert(storageObjects)
      .values({ assetId, objectClass: 'DERIVATIVE', bucket: getS3().bucket, key, contentType: 'image/png', byteSize: designed.buffer.byteLength, sha256, exifStripped: true, writeOnce: false })
      .returning();
    objectId = row!.id;
  }
  // the real pixel size goes with THIS design's hash — a stale record can never vouch for new bytes
  const designPx: DesignPx = { ...real, sha256 };
  await db.update(assets).set({ studioDoc: { ...docOf(g, objects, look, drawing, magic), designPx } }).where(eq(assets.id, assetId));
  // Anything drawn or added is new content: screen it before it can reach a print order. A colour
  // change can bring out what was hard to see, so that's screened too (the more careful choice).
  // (Rotate / crop / background / removals only ever show less of the screened upload.)
  if (objects.length || look || magic) await moderateDesignAndRecord(db, { assetId, familyId: ref.familyId, buffer: designed.buffer }, deps.moderation);
  else await clearDesignModeration(db, assetId);
  return { sourceObjectId: objectId, objectKey: key, aspect: designed.width / designed.height, realPx: real };
}

/**
 * AUTOSAVE (Studio spec §16): keep the parent's work as they go, cheaply — the recipe (geometry +
 * added things), and the transparency mask when it changed. Nothing is rendered or screened here
 * (that's saveStudio, on "done"): the products are still made from the last saved design, and
 * the original is never touched. Reopening the Studio picks up exactly where they left off.
 */
export async function autosaveStudioDoc(
  db: DbHandle,
  viewer: ViewerContext,
  assetId: string,
  input: { mask: Buffer | null; geometry: StudioGeometry; objects?: unknown; look?: unknown; drawing?: unknown; magic?: unknown; clearCutout?: boolean },
): Promise<void> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const g = cleanGeometry(input.geometry);
  const objects = cleanObjects(input.objects);
  const look = cleanLook(input.look);
  const drawing = cleanLayerLook(input.drawing);
  const magic = cleanMagic(input.magic);
  if (objectText(objects).some((t) => containsAbusiveText(t))) throw new StudioTextError('text not allowed');
  if (input.mask) await applyCutoutMask(db, viewer, assetId, input.mask);
  else if (input.clearCutout) await dropDerivative(db, assetId, 'cutout');
  // the last saved design is still what prints, so its real pixel size stays with it
  const [row] = await db.select({ doc: assets.studioDoc }).from(assets).where(eq(assets.id, assetId));
  const designPx = (row?.doc as { designPx?: DesignPx } | null)?.designPx;
  await db
    .update(assets)
    .set({ studioDoc: { ...docOf(g, objects, look, drawing, magic), ...(designPx ? { designPx } : {}) } })
    .where(eq(assets.id, assetId));
}

/** Remove a derivative for real: bytes first (confirmed), then the row. */
async function dropDerivative(db: DbHandle, assetId: string, kind: 'cutout' | 'design'): Promise<void> {
  const key = derivativeKey(assetId, kind);
  const [row] = await db.select({ id: storageObjects.id }).from(storageObjects).where(eq(storageObjects.key, key));
  if (!row) return;
  await deleteObjectConfirmed(key);
  await db.delete(storageObjects).where(eq(storageObjects.id, row.id));
}
