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
  product:
    | 'cushion' | 'heart cushion' | 'round cushion' | 'mug' | 'framed print' | 'card' | 'blanket' | 'jigsaw'
    | 'phone case' | 'wrapping paper' | 'tee' | 'socks' | 'playing cards' | 'height chart' | 'tea towel';
  caption: string;
  alt: string;
  cutout: boolean;
}

/**
 * The home page's carousel deals these into THREE rows (every third one per row) that slide
 * leftwards, each row looping so it always looks full — keep the count a multiple of 3. The
 * gifts page wall shows the first 12 (2 / 3 / 4 columns, full rows).
 */
export const EXAMPLES: Example[] = [
  { slug: 'tractor-cushion', src: '/examples/tractor-cushion.webp', width: 860, height: 848, product: 'cushion', caption: 'Lilly’s tractor', alt: 'A cushion printed with a child’s painting of a red tractor pulling a trailer of apples under a big sun', cutout: true },
  { slug: 'zebra-framed-print', src: '/examples/zebra-framed-print.webp', width: 884, height: 701, product: 'framed print', caption: 'framed in gold', alt: 'A child’s painting of a zebra on blue paper, in a gold frame', cutout: true },
  { slug: 'family-mug', src: '/examples/family-mug.webp', width: 617, height: 594, product: 'mug', caption: 'the whole family', alt: 'A blue mug printed with a child’s painting of their family holding hands, with the dog', cutout: true },
  { slug: 'rainbow-heart-cushion', src: '/examples/heartcushion.webp', width: 1200, height: 1200, product: 'heart cushion', caption: 'rainbow days', alt: 'A heart-shaped cushion printed with a child’s painting of a rainbow and a smiling sun over the sea', cutout: false },
  { slug: 'puppy-card', src: '/examples/puppy-card.webp', width: 702, height: 644, product: 'card', caption: 'Lily’s puppy', alt: 'A greetings card with a crayon drawing of a puppy outside a house, signed Lily, with a kraft envelope', cutout: true },
  { slug: 'handprints-cushion', src: '/examples/cushion3.webp', width: 1200, height: 1200, product: 'cushion', caption: 'four little hands', alt: 'A yellow cushion printed with four painted children’s handprints in red, blue, green and orange', cutout: false },
  { slug: 'crayon-girl-mug', src: '/examples/crayon-girl-mug.webp', width: 453, height: 598, product: 'mug', caption: 'me, in crayon', alt: 'A mug printed with a child’s crayon self-portrait in a pink dress', cutout: true },
  { slug: 'splatter-mug', src: '/examples/splatter-mug.webp', width: 618, height: 596, product: 'mug', caption: 'splat!', alt: 'A mug printed with a child’s colourful paint-splatter artwork', cutout: true },
  { slug: 'aeroplane-cushion', src: '/examples/aeroplane-cushion.webp', width: 900, height: 900, product: 'cushion', caption: 'off on holiday', alt: 'A white cushion printed with a child’s crayon drawing of a blue aeroplane among suns and clouds', cutout: false },
  { slug: 'framefamily', src: '/examples/framefamily.webp', width: 1200, height: 1200, product: 'framed print', caption: 'all of us', alt: 'A child’s crayon drawing of a family holding hands by a little blue house, in a light wooden frame', cutout: false },
  { slug: 'cushionsunflower', src: '/examples/cushionsunflower.webp', width: 1200, height: 1200, product: 'cushion', caption: 'sunflower', alt: 'A white cushion printed with a child’s thick-painted yellow sunflower', cutout: false },
  { slug: 'mugtruck', src: '/examples/mugtruck.webp', width: 1000, height: 1000, product: 'mug', caption: 'big green truck', alt: 'A blue-handled mug printed with a child’s painting of a green truck', cutout: false },
  { slug: 'cardcastle', src: '/examples/cardcastle.webp', width: 1200, height: 1200, product: 'card', caption: 'a castle for me', alt: 'A greetings card with a crayon drawing of a pink castle with blue turrets, beside a kraft envelope', cutout: false },
  { slug: 'blankettiger', src: '/examples/blankettiger.webp', width: 1200, height: 1200, product: 'blanket', caption: 'tiger, roaring', alt: 'A pink fleece blanket printed with a child’s crayon drawing of an orange tiger', cutout: false },
  { slug: 'cushionmonkey', src: '/examples/cushionmonkey.webp', width: 1200, height: 1200, product: 'round cushion', caption: 'cheeky monkey', alt: 'A round cushion printed with a child’s crayon drawing of a smiling monkey', cutout: false },
  { slug: 'framecow', src: '/examples/framecow.webp', width: 1200, height: 1200, product: 'framed print', caption: 'moo!', alt: 'A child’s painting of a black-and-white cow in a green field, in a dark wooden frame', cutout: false },
  { slug: 'puzzledigger', src: '/examples/puzzledigger.webp', width: 1200, height: 1200, product: 'jigsaw', caption: 'the big digger', alt: 'A jigsaw puzzle printed with a child’s painting of a yellow digger', cutout: false },
  { slug: 'mugfamily', src: '/examples/mugfamily.webp', width: 1000, height: 1000, product: 'mug', caption: 'under the sunshine', alt: 'A red-handled mug printed with a child’s drawing of a mum and child under a big sun', cutout: false },
  { slug: 'cushionheartflower', src: '/examples/cushionheartflower.webp', width: 1200, height: 1200, product: 'heart cushion', caption: 'a flower for you', alt: 'A heart-shaped cushion printed with a child’s painting of a bright red and orange flower', cutout: false },
  { slug: 'cardgiraffe', src: '/examples/cardgiraffe.webp', width: 1200, height: 1200, product: 'card', caption: 'Suzie’s giraffe', alt: 'A greetings card with a crayon drawing of a giraffe under the sun, signed Suzie, with a kraft envelope', cutout: false },
  { slug: 'framecar', src: '/examples/framecar.webp', width: 1200, height: 1200, product: 'framed print', caption: 'vroom', alt: 'A child’s crayon drawing of a red car on a sky-blue background, in a white frame', cutout: false },
  { slug: 'cushionfamily', src: '/examples/cushionfamily.webp', width: 1200, height: 1200, product: 'cushion', caption: 'mum, dad & me', alt: 'A square cushion printed with a child’s crayon drawing of their family and the dog', cutout: false },
  { slug: 'mugcat', src: '/examples/mugcat.webp', width: 1000, height: 1000, product: 'mug', caption: 'the orange cat', alt: 'An orange-lined mug printed with a child’s painting of an orange cat on blue', cutout: false },
  // ── the new range, in founder-made photos (23 Oct) ──
  { slug: 'autumnphone', src: '/examples/autumnphone.webp', width: 960, height: 1200, product: 'phone case', caption: 'autumn leaves', alt: 'A phone case printed with a child’s drawing of a hedgehog among red and orange autumn leaves', cutout: false },
  { slug: 'lionanklesocks', src: '/examples/lionanklesocks.webp', width: 1200, height: 1200, product: 'socks', caption: 'little lions', alt: 'A pair of yellow ankle socks printed all over with a child’s drawing of a smiling lion', cutout: false },
  { slug: 'christmascard', src: '/examples/christmascard.webp', width: 1200, height: 1200, product: 'card', caption: 'our christmas tree', alt: 'A red greetings card with a child’s painting of a Christmas tree, presents and a snowman, beside a kraft envelope', cutout: false },
  { slug: 'robotwrappaper', src: '/examples/robotwrappaper.webp', width: 1200, height: 1200, product: 'wrapping paper', caption: 'robots, on repeat', alt: 'Wrapping paper printed with a repeating pattern of a child’s drawing of a robot on pale blue', cutout: false },
  { slug: 'giraffeheightchart', src: '/examples/giraffeheightchart.webp', width: 960, height: 1200, product: 'height chart', caption: 'growing up with giraffe', alt: 'A canvas height chart on wooden hangers with a child’s drawing of a tall giraffe beside the ruler', cutout: false },
  { slug: 'christmastee', src: '/examples/christmastee.webp', width: 983, height: 968, product: 'tee', caption: 'snowman days', alt: 'A burgundy t-shirt printed with a child’s drawing of a snowman in falling snow', cutout: false },
  { slug: 'owlphone', src: '/examples/owlphone.webp', width: 960, height: 1200, product: 'phone case', caption: 'night owl', alt: 'A purple phone case printed with a child’s drawing of an owl on a branch under an orange moon', cutout: false },
  { slug: 'monstertubesocks', src: '/examples/monstertubesocks.webp', width: 1200, height: 1200, product: 'socks', caption: 'monster stomp', alt: 'A pair of bright green tube socks printed all over with a child’s drawing of a purple monster', cutout: false },
  { slug: 'flowerplayingcards', src: '/examples/flowerplayingcards.webp', width: 1200, height: 1200, product: 'playing cards', caption: 'sunflowers, dealt', alt: 'A deck of playing cards with a child’s painting of sunflowers in a blue vase on the back', cutout: false },
  { slug: 'cakewrappaper', src: '/examples/cakewrappaper.webp', width: 1200, height: 1200, product: 'wrapping paper', caption: 'birthday cake, on repeat', alt: 'Wrapping paper printed with a repeating pattern of a child’s drawing of a birthday cake on yellow', cutout: false },
  { slug: 'monsterteatowel', src: '/examples/monsterteatowel.webp', width: 1200, height: 1200, product: 'tea towel', caption: 'friendly monsters', alt: 'A lilac tea towel printed with a repeating pattern of a child’s drawing of a purple monster', cutout: false },
  { slug: 'underseaphone', src: '/examples/underseaphone.webp', width: 960, height: 1200, product: 'phone case', caption: 'under the sea', alt: 'A phone case printed with a child’s drawing of a goldfish and a pink octopus under the sea', cutout: false },
  { slug: 'floweranklesocks', src: '/examples/floweranklesocks.webp', width: 1200, height: 1200, product: 'socks', caption: 'flowers for feet', alt: 'A pair of white ankle socks printed all over with a child’s drawing of red and orange flowers', cutout: false },
  { slug: 'penguincard', src: '/examples/penguincard.webp', width: 1200, height: 1200, product: 'card', caption: 'penguin & igloo', alt: 'A greetings card with a child’s drawing of two penguins and an igloo under a starry sky, beside a kraft envelope', cutout: false },
  { slug: 'whaletubesocks', src: '/examples/whaletubesocks.webp', width: 1200, height: 1200, product: 'socks', caption: 'a whale of a time', alt: 'A pair of light blue tube socks printed all over with a child’s drawing of a blue whale', cutout: false },
  { slug: 'cushioncirclefamily', src: '/examples/cushioncirclefamily.webp', width: 1200, height: 1200, product: 'round cushion', caption: 'chalk friends', alt: 'A round black cushion printed with a child’s chalk drawing of three smiling people', cutout: false },
];

export const exampleBySlug = (slug: string): Example => {
  const e = EXAMPLES.find((x) => x.slug === slug);
  if (!e) throw new Error(`no example ${slug}`);
  return e;
};
