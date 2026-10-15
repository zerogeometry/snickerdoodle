/**
 * The garments — Stanley/Stella organic tees made by Prodigi's UK lab — as ONE source of truth for
 * the catalogue, the colour swatches, the derived product photos and the size-true previews.
 *
 * Kids:  Mini Creator 2.0 (STTK184, Prodigi TEE-SS-STTK909) — 100% organic ringspun cotton.
 *        Front print 260×260mm (3070×3070px @300dpi), the SAME for every size.
 * Adult: Sparker 2.0 heavy unisex (STTU171, Prodigi TEE-SS-STTM559) — 100% organic ringspun.
 *        Front print 396×498mm (4677×5881px, the full 16×20″ platen), the SAME for every size.
 * Both re-verified against GET /v4.0/products on 2026-10-15; both quote from GB lab uk9.
 */

export interface GarmentColour {
  /** Our colour name (shown to parents, used in skus). */
  name: string;
  /** Prodigi's attribute value for it. */
  attr: string;
  /** Close to the real fabric — for swatches AND the derived product photo. Approximate until the
   * Stanley/Stella colour cards are in hand (to-do: project-office/todo/PRODIGI-APPAREL-CHECKS.md). */
  hex: string;
}

export const KIDS_TEE_COLOURS: GarmentColour[] = [
  { name: 'white', attr: 'white', hex: '#ffffff' },
  { name: 'heather grey', attr: 'heather grey', hex: '#a9aaad' },
  { name: 'french navy', attr: 'french navy', hex: '#232c46' },
  { name: 'black', attr: 'black', hex: '#232325' },
  { name: 'anthracite', attr: 'anthracite', hex: '#46484b' },
  { name: 'caribbean blue', attr: 'caribbean blue', hex: '#2fa3b9' },
  { name: 'royal blue', attr: 'royal blue', hex: '#2f5bb0' },
  { name: 'cotton pink', attr: 'cotton pink', hex: '#f2c5cd' },
  { name: 'bright orange', attr: 'bright orange', hex: '#ef652e' },
  { name: 'ochre', attr: 'ochre', hex: '#cc9a37' },
  { name: 'burgundy', attr: 'burgundy', hex: '#6e2232' },
];

export const ADULT_TEE_COLOURS: GarmentColour[] = [
  { name: 'white', attr: 'white', hex: '#ffffff' },
  { name: 'heather grey', attr: 'heather grey', hex: '#a9aaad' },
  { name: 'french navy', attr: 'french navy', hex: '#232c46' },
  { name: 'black', attr: 'black', hex: '#232325' },
  { name: 'khaki', attr: 'khaki', hex: '#8b8466' },
];

/** A family set is ONE colour for everyone — so only the colours every garment comes in. */
export const FAMILY_SET_COLOURS = KIDS_TEE_COLOURS.filter((c) => ADULT_TEE_COLOURS.some((a) => a.name === c.name)).map((c) => c.name);

/** The garment products (printed direct-to-garment). */
export const GARMENT_PRODUCT_KEYS = ['kidsTee', 'adultTee', 'babyBodysuit'] as const;
export const isGarmentKey = (key: string | null | undefined): boolean => !!key && (GARMENT_PRODUCT_KEYS as readonly string[]).includes(key);

const ALL = [...KIDS_TEE_COLOURS, ...ADULT_TEE_COLOURS];
export const garmentHex = (name: string): string | null => ALL.find((c) => c.name === name)?.hex ?? null;

/**
 * Coloured garments print with a WHITE UNDERBASE (direct-to-garment): whatever isn't fully
 * see-through prints as solid ink, paper included. White garments print ink only.
 */
export const isDarkGarment = (colour: string | null | undefined): boolean => !!colour && colour !== 'white';

/**
 * Half-chest (flat, armpit to armpit) per size in mm — how big the tee is against the print,
 * which is a FIXED size. From the published Stanley/Stella size charts, rounded; to be confirmed
 * against a sample (to-do: project-office/todo/PRODIGI-APPAREL-CHECKS.md).
 */
export const KIDS_TEE_CHEST_MM: Record<string, number> = {
  '3-4 years': 330,
  '5-6 years': 360,
  '7-8 years': 390,
  '9-11 years': 420,
  '12-14 years': 450,
};
export const ADULT_TEE_CHEST_MM: Record<string, number> = { XS: 495, S: 525, M: 555, L: 585, XL: 615, '2XL': 645 };

export const KIDS_TEE_SIZES = Object.keys(KIDS_TEE_CHEST_MM);
export const ADULT_TEE_SIZES = Object.keys(ADULT_TEE_CHEST_MM);
export const KIDS_TEE_PRINT_MM = { w: 260, h: 260 } as const;
export const ADULT_TEE_PRINT_MM = { w: 396, h: 498 } as const;

/**
 * Where the print sits on the flat tee photo (derived/tee-photo*.png), in photo fractions, for a
 * given size: the print at its TRUE physical ratio to that size's chest. Constants are measured
 * from the photo by scripts/derive-garment-photo-blanks.mjs (torso width, centre, the top of the
 * print panel a little below the collar — the drop below the collar is to be confirmed with
 * Prodigi; to-do: PRODIGI-APPAREL-CHECKS.md).
 */
export const TEE_PHOTO = { torsoFrac: 0.4684, centreX: 0.4985, panelTop: 0.272, aspect: 1.0157 } as const;
export function teePrintRegion(printMm: { w: number; h: number }, chestMm: number): { x0: number; y0: number; x1: number; y1: number } {
  const w = (TEE_PHOTO.torsoFrac * printMm.w) / chestMm;
  const h = w * (printMm.h / printMm.w) * TEE_PHOTO.aspect;
  return { x0: TEE_PHOTO.centreX - w / 2, y0: TEE_PHOTO.panelTop, x1: TEE_PHOTO.centreX + w / 2, y1: TEE_PHOTO.panelTop + h };
}
