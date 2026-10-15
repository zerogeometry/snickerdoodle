import sharp from 'sharp';
import { GARMENT_PRODUCT_KEYS } from '@/lib/garments';

/**
 * Direct-to-garment (DTG) printing — the tees and the bodysuit.
 *
 * A DTG print file is a SEE-THROUGH PNG: ink lands only where the design is. (Flattened on white
 * like a paper print, a coloured tee would get a white rectangle — the lab lays a white underbase
 * under anything that isn't transparent.) On a coloured garment, half-see-through pixels print as
 * a grainy, speckled underbase, so the edges are made FIRM — solid or nothing — in the print file
 * AND in the preview, so the preview shows exactly what prints.
 */
export const DTG_GARMENT_KEYS = new Set<string>(GARMENT_PRODUCT_KEYS);

/** Alpha at or above this prints; below it doesn't. */
const FIRM_AT = 128;

/** Every pixel either fully printed or fully see-through (colour untouched). */
export async function firmEdges(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = data[i]! >= FIRM_AT ? 255 : 0;
  return sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}
