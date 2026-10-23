import 'server-only';
import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import sharp from 'sharp';
import { mockupViews, printTemplates, templateAssets } from '@/db/schema';
import { getS3, putObject } from '@/storage';
import type { DbHandle } from '@/server/db';

export type MaterialClass = 'PAPER' | 'LIGHT_FABRIC' | 'DARK_FABRIC' | 'CERAMIC' | 'GLOSS';

export interface SetMockupTemplateInput {
  variantId: string;
  /** The blank product PHOTO — brand-safe, NON-child (a real product shot with no design). */
  blank: Buffer;
  contentType?: string; // default image/webp
  /** 4 normalised (0..1) corners TL,TR,BR,BL of the PRINT AREA on the blank — registered
   * to Prodigi's real print region for this SKU (preview == print). */
  printQuad: [number, number][];
  materialClass?: MaterialClass;
  /** Optional product-silhouette mask (same aspect as the blank; white/opaque = printable).
   * The compositor clips the design to it so art can never overlap the product's edge —
   * essential for shaped products (heart/round cushions, bauble, sack, apron). PNG. */
  mask?: Buffer;
  /** Optional FOREGROUND overlay composited OVER the placed design (full-frame, same
   * canvas as the blank; transparent where nothing sits on the art). Stored as a LIGHTING
   * template asset. Used for authored on-top detail the art must read THROUGH — e.g. the
   * jigsaw's die-cut piece lines, so the drawing looks physically cut, not printed flat. PNG. */
  overlay?: Buffer;
  /** MORE print areas on the same photo that show the SAME print file — a pair of socks, one per
   * sock. Each is 4 normalised corners like printQuad. Display only; absent = one print area. */
  extraQuads?: [number, number][][];
}

/**
 * Author (or re-author) a variant's mockup template — the committed, in-region path for
 * adding real product photos (vs ad-hoc SQL). It uploads the blank to the SAME private
 * bucket as the rest of storage, registers it in template_assets (structurally NON-child:
 * no assetId), and points the variant's print_template at it — BUMPING templateVersion so
 * every cached mockup invalidates and re-renders against the new blank. The blank is the
 * only third-party-sourced input; the child's design never touches this path.
 */
/**
 * Fail LOUD at authoring, not at render. A STRAIGHT (axis-aligned) print area must sit inside the
 * blank: the flat compositor cuts that region out of the photo, so a quad past the edge (e.g. an
 * aspect-locked cover on a wrong-orientation photo) would throw on every request. An ANGLED one may
 * overhang a little — the perspective warp only ever draws onto the photo's own pixels and the mask
 * trims to the product (ankle socks laid at 24°: the turned print area reaches past the corners) —
 * but its centre must be on the photo and no corner far off it. Exported for its unit test.
 */
export function assertQuadFitsBlank(quad: [number, number][], opts: { warped?: boolean } = {}): void {
  const [tl, tr, br, bl] = quad as [[number, number], [number, number], [number, number], [number, number]];
  const tol = 0.004; // the compositor's own isAxisAligned tolerance
  // `warped`: the area is drawn by the perspective warp even when straight (several print areas —
  // a pair of socks), which only ever paints onto the photo's own pixels, so it may overhang too
  const straight = !opts.warped && Math.abs(tl[0] - bl[0]) < tol && Math.abs(tr[0] - br[0]) < tol && Math.abs(tl[1] - tr[1]) < tol && Math.abs(bl[1] - br[1]) < tol;
  const [lo, hi] = straight ? [-0.005, 1.005] : [-0.25, 1.25];
  for (const [x, y] of quad) {
    if (x < lo || x > hi || y < lo || y > hi) {
      throw new Error(`printQuad extends outside the blank (got [${x.toFixed(3)}, ${y.toFixed(3)}]) — wrong photo orientation or region for this print canvas?`);
    }
  }
  const cx = quad.reduce((s, p) => s + p[0], 0) / 4, cy = quad.reduce((s, p) => s + p[1], 0) / 4;
  if (cx < 0 || cx > 1 || cy < 0 || cy > 1) throw new Error(`printQuad's centre is off the blank (${cx.toFixed(3)}, ${cy.toFixed(3)})`);
}

export async function setMockupTemplate(db: DbHandle, input: SetMockupTemplateInput): Promise<{ blankObjectId: string; templateVersion: number; key: string }> {
  if (!Array.isArray(input.printQuad) || input.printQuad.length !== 4) {
    throw new Error('printQuad must be 4 normalised [x,y] corners (TL,TR,BR,BL)');
  }
  const warped = !!input.extraQuads?.length; // several areas → always the perspective warp
  assertQuadFitsBlank(input.printQuad as [number, number][], { warped });
  for (const q of input.extraQuads ?? []) {
    if (!Array.isArray(q) || q.length !== 4) throw new Error('each extra print quad must be 4 normalised [x,y] corners (TL,TR,BR,BL)');
    assertQuadFitsBlank(q, { warped });
  }
  const [tpl] = await db.select({ version: printTemplates.templateVersion }).from(printTemplates).where(eq(printTemplates.variantId, input.variantId));
  if (!tpl) throw new Error(`no print_template for variant ${input.variantId}`);
  const templateVersion = (tpl.version ?? 1) + 1; // bump → cached mockups invalidate (version is in the key)

  const contentType = input.contentType ?? 'image/webp';
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const meta = await sharp(input.blank).metadata();
  const key = `templates/${input.variantId}/v${templateVersion}/blank.${ext}`;
  const { bucket } = getS3();
  await putObject(key, input.blank, contentType);
  const sha256 = createHash('sha256').update(input.blank).digest('hex');

  // Upsert on the unique key: if a version counter was ever rewound (e.g. by a test or a
  // restored backup) the same versioned key can recur — putObject has already replaced the
  // bytes, so updating the row to match keeps authoring idempotent instead of throwing.
  const blankRow = { kind: 'BLANK' as const, bucket, key, contentType, byteSize: input.blank.byteLength, sha256, widthPx: meta.width ?? null, heightPx: meta.height ?? null };
  const [ta] = await db
    .insert(templateAssets)
    .values(blankRow)
    .onConflictDoUpdate({ target: templateAssets.key, set: blankRow })
    .returning();

  // Optional silhouette mask — its own MASK template_assets row. Re-authoring WITHOUT a
  // mask clears any previous one (a stale mask must never outlive its blank).
  let maskObjectId: string | null = null;
  if (input.mask) {
    const maskKey = `templates/${input.variantId}/v${templateVersion}/mask.png`;
    await putObject(maskKey, input.mask, 'image/png');
    const maskMeta = await sharp(input.mask).metadata();
    const maskRow = {
      kind: 'MASK' as const, bucket, key: maskKey, contentType: 'image/png', byteSize: input.mask.byteLength,
      sha256: createHash('sha256').update(input.mask).digest('hex'),
      widthPx: maskMeta.width ?? null, heightPx: maskMeta.height ?? null,
    };
    const [ma] = await db
      .insert(templateAssets)
      .values(maskRow)
      .onConflictDoUpdate({ target: templateAssets.key, set: maskRow })
      .returning();
    maskObjectId = ma!.id;
  }

  // Optional foreground overlay (piece lines etc.) — its own LIGHTING template_assets row,
  // composited OVER the design at render time. Re-authoring WITHOUT one clears any previous.
  let lightingObjectId: string | null = null;
  if (input.overlay) {
    const overlayKey = `templates/${input.variantId}/v${templateVersion}/overlay.png`;
    await putObject(overlayKey, input.overlay, 'image/png');
    const oMeta = await sharp(input.overlay).metadata();
    const overlayRow = {
      kind: 'LIGHTING' as const, bucket, key: overlayKey, contentType: 'image/png', byteSize: input.overlay.byteLength,
      sha256: createHash('sha256').update(input.overlay).digest('hex'),
      widthPx: oMeta.width ?? null, heightPx: oMeta.height ?? null,
    };
    const [oa] = await db
      .insert(templateAssets)
      .values(overlayRow)
      .onConflictDoUpdate({ target: templateAssets.key, set: overlayRow })
      .returning();
    lightingObjectId = oa!.id;
  }

  await db
    .update(printTemplates)
    // extra print areas: re-authoring without them clears any previous ones (never a stale pair)
    .set({ blankObjectId: ta!.id, maskObjectId, lightingObjectId, printQuad: input.printQuad, extraQuads: input.extraQuads?.length ? input.extraQuads : null, materialClass: input.materialClass ?? 'PAPER', templateVersion })
    .where(eq(printTemplates.variantId, input.variantId));

  return { blankObjectId: ta!.id, templateVersion, key };
}

/** Upload a brand-safe template image + upsert its template_assets row (keyed by storage key). */
async function putAsset(db: DbHandle, kind: 'BLANK' | 'MASK' | 'LIGHTING', key: string, buf: Buffer, contentType: string): Promise<string> {
  const { bucket } = getS3();
  await putObject(key, buf, contentType);
  const meta = await sharp(buf).metadata();
  const row = { kind, bucket, key, contentType, byteSize: buf.byteLength, sha256: createHash('sha256').update(buf).digest('hex'), widthPx: meta.width ?? null, heightPx: meta.height ?? null };
  const [ta] = await db.insert(templateAssets).values(row).onConflictDoUpdate({ target: templateAssets.key, set: row }).returning();
  return ta!.id;
}

export interface SetMockupViewInput {
  variantId: string;
  /** The alternate view name, e.g. 'tin'. */
  view: string;
  blank: Buffer;
  contentType?: string;
  /** 4 normalised corners TL,TR,BR,BL of the print area on the blank. MAY be a perspective
   * quad (non-axis-aligned) — the compositor warps the design onto it. */
  printQuad: [number, number][];
  /** The print area's own pixel size (its aspect): the compositor cover-fits the art to this
   * before warping onto printQuad. e.g. the tin lid's 869×674. */
  printWidthPx: number;
  printHeightPx: number;
  materialClass?: MaterialClass;
  mask?: Buffer;
  overlay?: Buffer;
}

/**
 * Author (or re-author) an ALTERNATE display mockup view for a variant (mockup_views) — the
 * committed path for a second angle / companion product (e.g. the jigsaw tin). Display-only:
 * it never touches print_templates or the print/fulfilment path. Bumps templateVersion so
 * cached mockups for this view invalidate.
 */
export async function setMockupView(db: DbHandle, input: SetMockupViewInput): Promise<{ templateVersion: number }> {
  if (!Array.isArray(input.printQuad) || input.printQuad.length !== 4) throw new Error('printQuad must be 4 normalised corners (TL,TR,BR,BL)');
  for (const [x, y] of input.printQuad) {
    if (x < -0.005 || x > 1.005 || y < -0.005 || y > 1.005) throw new Error(`printQuad corner outside the blank (got [${x.toFixed(3)}, ${y.toFixed(3)}])`);
  }
  const [existing] = await db
    .select({ v: mockupViews.templateVersion })
    .from(mockupViews)
    .where(and(eq(mockupViews.variantId, input.variantId), eq(mockupViews.view, input.view)));
  const templateVersion = (existing?.v ?? 0) + 1;

  const contentType = input.contentType ?? 'image/webp';
  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/jpeg' ? 'jpg' : 'webp';
  const base = `templates/${input.variantId}/${input.view}/v${templateVersion}`;
  const blankObjectId = await putAsset(db, 'BLANK', `${base}/blank.${ext}`, input.blank, contentType);
  const maskObjectId = input.mask ? await putAsset(db, 'MASK', `${base}/mask.png`, input.mask, 'image/png') : null;
  const overlayObjectId = input.overlay ? await putAsset(db, 'LIGHTING', `${base}/overlay.png`, input.overlay, 'image/png') : null;

  const row = {
    variantId: input.variantId,
    view: input.view,
    templateVersion,
    materialClass: input.materialClass ?? ('PAPER' as const),
    blankObjectId,
    printQuad: input.printQuad,
    maskObjectId,
    overlayObjectId,
    printWidthPx: input.printWidthPx,
    printHeightPx: input.printHeightPx,
  };
  await db.insert(mockupViews).values(row).onConflictDoUpdate({ target: [mockupViews.variantId, mockupViews.view], set: row });
  return { templateVersion };
}
