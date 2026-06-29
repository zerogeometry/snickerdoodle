import 'server-only';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { printTemplates, templateAssets } from '@/db/schema';
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
}

/**
 * Author (or re-author) a variant's mockup template — the committed, in-region path for
 * adding real product photos (vs ad-hoc SQL). It uploads the blank to the SAME private
 * bucket as the rest of storage, registers it in template_assets (structurally NON-child:
 * no assetId), and points the variant's print_template at it — BUMPING templateVersion so
 * every cached mockup invalidates and re-renders against the new blank. The blank is the
 * only third-party-sourced input; the child's design never touches this path.
 */
export async function setMockupTemplate(db: DbHandle, input: SetMockupTemplateInput): Promise<{ blankObjectId: string; templateVersion: number; key: string }> {
  if (!Array.isArray(input.printQuad) || input.printQuad.length !== 4) {
    throw new Error('printQuad must be 4 normalised [x,y] corners (TL,TR,BR,BL)');
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

  const [ta] = await db
    .insert(templateAssets)
    .values({ kind: 'BLANK', bucket, key, contentType, byteSize: input.blank.byteLength, sha256, widthPx: meta.width ?? null, heightPx: meta.height ?? null })
    .returning();

  await db
    .update(printTemplates)
    .set({ blankObjectId: ta!.id, printQuad: input.printQuad, materialClass: input.materialClass ?? 'PAPER', templateVersion })
    .where(eq(printTemplates.variantId, input.variantId));

  return { blankObjectId: ta!.id, templateVersion, key };
}
