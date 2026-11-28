/**
 * The doodle mug's print file vs the mug itself (founder, 28 Nov 2026: "make sure it prints top to bottom
 * exactly as pictured in our previews").
 *
 * The mug is Prodigi's "11oz Coloured mug", printed top to bottom. Its file is 209.5×98 mm (2474×1157 px
 * at 300 dpi), and Prodigi's template for it (`.prodigi-assets/templates/prodigi-coloured-photo-mugs-templates`)
 * marks a BLEED band that runs off the mug: 12 px (1 mm) at the top and 24 px (2 mm) at the bottom. The
 * other ~95 mm covers the mug from rim to base. The full width prints (no side bleed); the ~48 mm left of
 * the ~258 mm circumference is the bare gap at the handle.
 *
 * Every preview (the photo wrap in src/server/print/compositor.ts, the 3D mug in src/ui/three/models.ts)
 * shows ONLY the part that lands on the mug, so what a parent sees is what comes out of the box.
 */
export const MUG_BLEED_MM = { top: 1, bottom: 2 } as const;

/** Rows of a print-file-shaped image (heightPx tall, standing for MUG_FILE_HEIGHT_MM) that fall off the mug. */
export const MUG_FILE_HEIGHT_MM = 98;
export function mugBleedRows(heightPx: number): { top: number; bottom: number } {
  const perMm = heightPx / MUG_FILE_HEIGHT_MM;
  return { top: Math.round(MUG_BLEED_MM.top * perMm), bottom: Math.round(MUG_BLEED_MM.bottom * perMm) };
}
