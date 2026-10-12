/**
 * Example keepsakes for marketing surfaces — made by the founder in the app from brand-safe
 * sample drawings (no real customer or child data). Files live in /public/examples; produced by
 * scripts/cutout-examples.mjs. `cutout` = transparent background with a real shadow (sits on
 * any surface); otherwise it's a photo on cream and should only be shown inside a frame.
 */
export interface Example {
  slug: string;
  src: string;
  width: number;
  height: number;
  product: 'cushion' | 'heart cushion' | 'mug' | 'framed print' | 'card';
  caption: string;
  alt: string;
  cutout: boolean;
}

export const EXAMPLES: Example[] = [
  { slug: 'tractor-cushion', src: '/examples/tractor-cushion.webp', width: 860, height: 848, product: 'cushion', caption: 'Lilly’s tractor', alt: 'A cushion printed with a child’s painting of a red tractor pulling a trailer of apples under a big sun', cutout: true },
  { slug: 'zebra-framed-print', src: '/examples/zebra-framed-print.webp', width: 884, height: 701, product: 'framed print', caption: 'framed in gold', alt: 'A child’s painting of a zebra on blue paper, in a gold frame', cutout: true },
  { slug: 'family-mug', src: '/examples/family-mug.webp', width: 617, height: 594, product: 'mug', caption: 'the whole family', alt: 'A blue mug printed with a child’s painting of their family holding hands, with the dog', cutout: true },
  { slug: 'rainbow-heart-cushion', src: '/examples/rainbow-heart-cushion.webp', width: 822, height: 720, product: 'heart cushion', caption: 'rainbow days', alt: 'A heart-shaped cushion printed with a child’s painting of a rainbow and a smiling sun', cutout: true },
  { slug: 'puppy-card', src: '/examples/puppy-card.webp', width: 702, height: 644, product: 'card', caption: 'Lily’s puppy', alt: 'A greetings card with a crayon drawing of a puppy outside a house, signed Lily, with a kraft envelope', cutout: true },
  { slug: 'handprints-cushion', src: '/examples/handprints-cushion.webp', width: 857, height: 848, product: 'cushion', caption: 'four little hands', alt: 'A yellow cushion printed with four painted children’s handprints in red, blue, green and orange', cutout: true },
  { slug: 'crayon-girl-mug', src: '/examples/crayon-girl-mug.webp', width: 453, height: 598, product: 'mug', caption: 'me, in crayon', alt: 'A mug printed with a child’s crayon self-portrait in a pink dress', cutout: true },
  { slug: 'splatter-mug', src: '/examples/splatter-mug.webp', width: 618, height: 596, product: 'mug', caption: 'splat!', alt: 'A mug printed with a child’s colourful paint-splatter artwork', cutout: true },
  { slug: 'aeroplane-cushion', src: '/examples/aeroplane-cushion.webp', width: 900, height: 900, product: 'cushion', caption: 'off on holiday', alt: 'A white cushion printed with a child’s crayon drawing of a blue aeroplane among suns and clouds', cutout: false },
];

export const exampleBySlug = (slug: string): Example => {
  const e = EXAMPLES.find((x) => x.slug === slug);
  if (!e) throw new Error(`no example ${slug}`);
  return e;
};
