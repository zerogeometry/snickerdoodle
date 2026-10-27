/**
 * The PUBLIC face of each product in the shop (C6–C8, GTM plan 27 Oct): the evergreen URL of its
 * public product page, the words search engines and Merchant Center see, its Google product
 * category, and ONE brand-safe photo.
 *
 * IMAGES: only brand-safe marketing images may appear here — the founder-made example keepsakes
 * (src/lib/examples.ts, synthetic sample drawings) and the Christmas concept photos in
 * /public/christmas. NEVER a customer's upload, a child's picture or anything from a bucket — a unit
 * test holds every `src` to those two folders + lists. A product with no photo yet gets no image:
 * its page shows the drawn product art, and the Merchant feed leaves it out (an image is required).
 *
 * Every product on show needs an entry here (unit-tested), the way the FAQ's price table does.
 * Prices are NOT here: they come from the server catalogue only.
 */

export interface ShopImage {
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface ShopProductCopy {
  /** The page's evergreen URL: /products/<slug> (never renamed — it gains age in search). */
  slug: string;
  /** Shown name, lowercase as the brand writes it. */
  name: string;
  /** The search / Merchant Center title: what a family types, sentence case, no shouting. */
  title: string;
  /** Google's product taxonomy (en-GB, checked 27 Oct 2026 against taxonomy-with-ids.en-GB.txt). */
  googleCategory: { id: number; path: string };
  /** Our own shelf, for Merchant Center's product_type. */
  productType: string;
  image?: ShopImage;
  /** A friendlier name for a price group than its attributes give (key = price in pence). */
  groupLabel?: Record<number, string>;
  /** Merchant Center extras. Clothing must say colour, size, age group + gender per item; `exclude`
   * keeps a product out of the feed (its page + markup stay), with the reason. */
  feed?: { exclude?: string; color?: string; size?: string; ageGroup?: 'adult' | 'kids'; gender?: 'unisex' };
}

const ex = (file: string, width: number, height: number, alt: string): ShopImage => ({ src: `/examples/${file}.webp`, width, height, alt });
const xmas = (file: string, width: number, height: number, alt: string): ShopImage => ({ src: `/christmas/${file}.webp`, width, height, alt });

/** The brand-safe Christmas concept photos (synthetic sample art, true to the real products — e74ceb5). */
export const CHRISTMAS_PHOTOS = ['/christmas/bauble.webp', '/christmas/ball-and-present.webp', '/christmas/sack.webp', '/christmas/presents.webp'] as const;

const CAT = {
  artwork: { id: 500044, path: 'Home & Garden > Decor > Artwork > Posters, Prints & Visual Artwork' },
  mugs: { id: 2169, path: 'Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs' },
  pillows: { id: 4454, path: 'Home & Garden > Decor > Throw Pillows' },
  tops: { id: 212, path: 'Clothing & Accessories > Clothing > Shirts & Tops' },
  jigsaws: { id: 2618, path: 'Toys & Games > Puzzles > Jigsaw Puzzles' },
  blankets: { id: 1985, path: 'Home & Garden > Linens & Bedding > Bedding > Blankets' },
  cards: { id: 95, path: 'Arts & Entertainment > Party & Celebration > Gift Giving > Greeting & Note Cards' },
  calendars: { id: 927, path: 'Office Supplies > Filing & Organisation > Calendars, Organisers & Planners' },
  ornaments: { id: 3144, path: 'Home & Garden > Decor > Seasonal & Holiday Decorations > Holiday Ornaments' },
  holiday: { id: 596, path: 'Home & Garden > Decor > Seasonal & Holiday Decorations' },
  phoneCases: { id: 2353, path: 'Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Cases' },
  socks: { id: 209, path: 'Clothing & Accessories > Clothing > Underwear & Socks > Socks' },
  growthCharts: { id: 499693, path: 'Home & Garden > Decor > Growth Charts' },
  wrap: { id: 2816, path: 'Arts & Entertainment > Party & Celebration > Gift Giving > Gift Wrapping > Wrapping Paper' },
  teaTowels: { id: 4257, path: 'Home & Garden > Linens & Bedding > Towels > Kitchen Towels' },
  cardGames: { id: 1247, path: 'Toys & Games > Games > Card Games' },
} as const;

export const SHOP_PRODUCTS: Record<string, ShopProductCopy> = {
  framedPrint: {
    slug: 'framed-print', name: 'framed print', title: 'Framed print of your child’s drawing',
    googleCategory: CAT.artwork, productType: 'Home > Framed prints',
    image: ex('framefamily', 1200, 1200, 'A child’s crayon drawing of a family holding hands by a little blue house, in a light wooden frame'),
  },
  mug: {
    slug: 'mug', name: 'mug', title: 'Personalised mug with your child’s drawing',
    googleCategory: CAT.mugs, productType: 'Home > Mugs',
    image: ex('mugtruck', 1000, 1000, 'A blue-handled mug printed with a child’s painting of a green truck'),
  },
  cushion: {
    slug: 'cushion', name: 'cushion', title: 'Personalised cushion with your child’s drawing',
    googleCategory: CAT.pillows, productType: 'Home > Cushions',
    image: ex('cushionsunflower', 1200, 1200, 'A white cushion printed with a child’s thick-painted yellow sunflower'),
  },
  kidsTee: {
    slug: 'kids-t-shirt', name: 'kids tee', title: 'Kids’ organic T-shirt with their own drawing',
    googleCategory: CAT.tops, productType: 'Clothing > Kids T-shirts',
    image: ex('christmastee', 983, 968, 'A burgundy t-shirt printed with a child’s drawing of a snowman in falling snow'),
    groupLabel: { 2700: 'colours' },
    // clothing needs ONE size + colour per feed item (5 sizes × 11 colours): left out until that's worth doing
    feed: { exclude: 'clothing needs one item per size and colour' },
  },
  adultTee: {
    slug: 'adult-t-shirt', name: 'adult tee', title: 'Adult organic T-shirt with your child’s drawing',
    googleCategory: CAT.tops, productType: 'Clothing > Adult T-shirts',
    // no brand-safe photo of the adult tee yet (the burgundy one is the kids tee)
  },
  jigsaw: {
    slug: 'jigsaw', name: 'jigsaw', title: 'Jigsaw puzzle made from your child’s drawing',
    googleCategory: CAT.jigsaws, productType: 'Games > Jigsaws',
    image: ex('puzzledigger', 1200, 1200, 'A jigsaw puzzle printed with a child’s painting of a yellow digger'),
  },
  blanket: {
    slug: 'fleece-blanket', name: 'fleece blanket', title: 'Personalised fleece blanket with your child’s drawing',
    googleCategory: CAT.blankets, productType: 'Home > Blankets',
    image: ex('blankettiger', 1200, 1200, 'A pink fleece blanket printed with a child’s crayon drawing of an orange tiger'),
  },
  card: {
    slug: 'greetings-card', name: 'greetings card', title: 'Greetings card with your child’s drawing on the front',
    googleCategory: CAT.cards, productType: 'Cards > Greetings cards',
    image: ex('penguincard', 1200, 1200, 'A greetings card with a child’s drawing of two penguins and an igloo under a starry sky, beside a kraft envelope'),
  },
  cardPack: {
    slug: 'card-pack', name: 'card pack', title: 'Christmas cards from your child’s drawings — packs of 5 or 10',
    googleCategory: CAT.cards, productType: 'Cards > Card packs',
    image: ex('christmascard', 1200, 1200, 'A red greetings card with a child’s painting of a Christmas tree, presents and a snowman, beside a kraft envelope'),
  },
  calendar: {
    slug: 'wall-calendar', name: '2027 calendar', title: '2027 wall calendar with your child’s drawings',
    googleCategory: CAT.calendars, productType: 'Prints > Calendars',
    // no photo yet: the concept image isn't the real layout (e74ceb5) — added when samples land
  },
  ceramicOrnament: {
    slug: 'ceramic-christmas-ornament', name: 'ceramic christmas ornament', title: 'Personalised ceramic Christmas ornament from your child’s drawing',
    googleCategory: CAT.ornaments, productType: 'Christmas > Ornaments',
    image: xmas('bauble', 896, 1152, 'A flat round ceramic ornament printed with a child’s crayon snowman, hanging on a gold string on a Christmas tree'),
  },
  christmasBauble: {
    slug: 'christmas-bauble', name: 'christmas bauble', title: 'Personalised shatterproof Christmas bauble from your child’s drawing',
    googleCategory: CAT.ornaments, productType: 'Christmas > Baubles',
    image: xmas('ball-and-present', 1200, 800, 'A clear plastic ball bauble printed with a child’s crayon Christmas tree, beside a present wrapped in that tree on repeat'),
  },
  sack: {
    slug: 'christmas-sack', name: 'christmas sack', title: 'Personalised Christmas sack with your child’s drawing',
    googleCategory: CAT.holiday, productType: 'Christmas > Sacks',
    image: xmas('sack', 1000, 778, 'A natural cotton Christmas sack printed with a child’s crayon reindeer, by a fireplace'),
  },
  phoneCase: {
    slug: 'phone-case', name: 'phone case', title: 'Phone case with your child’s drawing',
    googleCategory: CAT.phoneCases, productType: 'Tech > Phone cases',
    image: ex('owlphone', 960, 1200, 'A purple phone case printed with a child’s drawing of an owl on a branch under an orange moon'),
  },
  socks: {
    slug: 'socks', name: 'socks', title: 'Socks printed with your child’s drawing',
    googleCategory: CAT.socks, productType: 'Clothing > Socks',
    image: ex('lionanklesocks', 1200, 1200, 'A pair of yellow ankle socks printed all over with a child’s drawing of a smiling lion'),
    feed: { color: 'Multicolour', size: 'UK 6–10', ageGroup: 'adult', gender: 'unisex' },
  },
  heightChart: {
    slug: 'height-chart', name: 'height chart', title: 'Canvas height chart with your child’s drawing',
    googleCategory: CAT.growthCharts, productType: 'Home > Height charts',
    image: ex('giraffeheightchart', 960, 1200, 'A canvas height chart on wooden hangers with a child’s drawing of a tall giraffe beside the ruler'),
  },
  wrappingPaper: {
    slug: 'wrapping-paper', name: 'wrapping paper', title: 'Wrapping paper made from your child’s drawing',
    googleCategory: CAT.wrap, productType: 'Christmas > Wrapping paper',
    image: ex('robotwrappaper', 1200, 1200, 'Wrapping paper printed with a repeating pattern of a child’s drawing of a robot on pale blue'),
  },
  teaTowel: {
    slug: 'tea-towel', name: 'tea towel', title: 'Tea towel printed with your child’s drawing',
    googleCategory: CAT.teaTowels, productType: 'Home > Tea towels',
    image: ex('monsterteatowel', 1200, 1200, 'A lilac tea towel printed with a repeating pattern of a child’s drawing of a purple monster'),
  },
  playingCards: {
    slug: 'playing-cards', name: 'playing cards', title: 'Playing cards with your child’s drawing on the back',
    googleCategory: CAT.cardGames, productType: 'Games > Playing cards',
    image: ex('flowerplayingcards', 1200, 1200, 'A deck of playing cards with a child’s painting of sunflowers in a blue vase on the back'),
  },
};

/** The public page for a product. */
export const productPath = (key: string): string => `/products/${SHOP_PRODUCTS[key]?.slug ?? key}`;

/** slug → product key (undefined when nobody listed it). */
export const productKeyForSlug = (slug: string): string | undefined => Object.entries(SHOP_PRODUCTS).find(([, c]) => c.slug === slug)?.[0];

/** Every public product page path — for the sitemap and the noindex-by-default allowlist. */
export const PRODUCT_PATHS: string[] = Object.keys(SHOP_PRODUCTS).map(productPath);

/** Straight into the create flow for one product: upload, then "make the <product>" (ChosenProduct). */
export const createPathFor = (key: string): string => `/start-creating?for=${key}`;
