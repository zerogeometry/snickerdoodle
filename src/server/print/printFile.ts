import { DESIGNED_TURNED, PRODIGI_NATIVE_ORIENTATION } from '@/server/catalogue';
import { CARD_SPREAD } from './cardPrint';
import { canvasSizePx, type TemplateGeom } from './geometry';

type Size = { w: number; h: number };

/**
 * The pixel size of the print FILE a variant sends Prodigi, exactly as render.ts makes it: the canvas
 * (print area + bleed), turned back to Prodigi's native orientation when the variant is designed on a
 * turned canvas, doubled in width for a DUAL cushion ([front | back]), and the card's 4-panel spread.
 * Every order goes with `sizing: 'fillPrintArea'`, so Prodigi scales this to cover ITS print area and
 * silently crops any difference in shape — checkPrintSpec compares the two so that can't go unnoticed.
 */
export function printFileSize(productKey: string, attributes: Record<string, string> | null | undefined, t: TemplateGeom): Size {
  if (productKey === 'card' || productKey === 'cardPack') return { w: CARD_SPREAD.widthPx, h: CARD_SPREAD.heightPx };
  const a = attributes ?? {};
  const { width, height } = canvasSizePx(t);
  const native = PRODIGI_NATIVE_ORIENTATION[productKey] ?? 'portrait';
  const turn = DESIGNED_TURNED.has(productKey) || (!!a.orientation && a.orientation !== native);
  const w = (turn ? height : width) * (a.sides === 'double' ? 2 : 1);
  return { w, h: turn ? width : height };
}

/** One Prodigi variant's print areas (GET /v4.0/products/{sku} → variants[]), sizes in px. */
export interface ProdigiAreaVariant {
  attributes: Record<string, string>;
  printAreaSizes: Record<string, Size>;
}

/** Shapes may differ by this much (0.5%) before Prodigi's crop is worth a warning — and equal px is still required. */
export const ASPECT_TOLERANCE = 0.005;

/**
 * Does a variant's print file match Prodigi's print area for it? null when it does; otherwise a plain
 * sentence saying how it differs. The variant's order-time attributes pick Prodigi's variant(s); its
 * first `printTo` area is the one compared (every area a product fills shares one file).
 *
 * Every product — DTG garments included (founder, 29 Oct: no more half-size 150dpi garment files) — must
 * send exactly Prodigi's px. A garment is still JUDGED at 150dpi (its template's gateDpi).
 */
export function checkPrintSpec(spec: {
  productKey: string;
  prodigiAttrs: Record<string, string> | null;
  printTo: string[];
  file: Size;
  prodigi: ProdigiAreaVariant[];
}): string | null {
  const want = Object.entries(spec.prodigiAttrs ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()] as const);
  const area = spec.printTo[0] ?? 'default';
  const matching = spec.prodigi.filter((p) => {
    const attrs = Object.fromEntries(Object.entries(p.attributes).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
    return want.every(([k, v]) => !(k in attrs) || attrs[k] === v);
  });
  const sizes = [...new Map(matching.flatMap((p) => (p.printAreaSizes[area] ? [p.printAreaSizes[area]!] : [])).map((s) => [`${s.w}×${s.h}`, s])).values()];
  const ours = `${spec.file.w}×${spec.file.h}`;
  if (sizes.length === 0) return `Prodigi has no "${area}" print area for ${JSON.stringify(spec.prodigiAttrs ?? {})}`;
  if (sizes.length > 1) return `Prodigi's "${area}" print area differs between its routes for this variant (${sizes.map((s) => `${s.w}×${s.h}`).join(', ')}); ours is ${ours}`;
  const theirs = sizes[0]!;
  const target = theirs;
  const aspectOff = spec.file.w / spec.file.h / (theirs.w / theirs.h) - 1;
  if (Math.abs(aspectOff) > ASPECT_TOLERANCE) {
    return `print file ${ours} is a different shape from Prodigi's "${area}" ${theirs.w}×${theirs.h} (${(aspectOff * 100).toFixed(1)}%) — Prodigi will crop it`;
  }
  if (spec.file.w !== target.w || spec.file.h !== target.h) {
    return `print file ${ours} isn't Prodigi's "${area}" ${theirs.w}×${theirs.h} — Prodigi will rescale it`;
  }
  return null;
}
