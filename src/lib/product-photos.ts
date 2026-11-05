import generated from './product-photos.json';

/**
 * The public product pages' DEMO photos (founder, 5 Nov): one shared, brand-safe sample drawing,
 * rendered through each product's own mockup template by scripts/render-product-photos.ts, which
 * writes the files to /public/products and their sizes to product-photos.json (committed with them).
 *
 * The drawing is the home hero's painting (src/ui/components/RangeHero.tsx) — synthetic sample art,
 * never a family's upload — so "one drawing, a whole range" reads the same across the site.
 */
export const DEMO_DRAWING = 'examples/range/drawing.webp';
/** The folder under /public the photos live in (allowlisted for public pages + the Merchant feed). */
export const PRODUCT_PHOTO_DIR = 'products';

export interface ProductPhoto {
  src: string;
  width: number;
  height: number;
}

/** The generated photo for a product, when the script has rendered one. */
export const productPhoto = (key: string): ProductPhoto | undefined => (generated as Record<string, ProductPhoto>)[key];
