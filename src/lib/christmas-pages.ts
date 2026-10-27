/**
 * The evergreen CHRISTMAS search pages (C6, GTM plan 27 Oct; project-office/briefs/CHRISTMAS-strategy.md
 * §6): the /christmas hub and one page per thing families search for. EVERGREEN URLs — never
 * /christmas-2026 — so they gain age year on year; the words live here, the dates come from the one
 * last-order table in src/lib/season.ts, and the prices from the server catalogue at render time.
 * Next Christmas is an edit to this file (and the date table), not a build.
 *
 * Built like the FAQ (src/lib/faq.ts, project-office/briefs/SEO-AEO-faq.md): each page answers ONE
 * question in its first sentence, naming Snickerdoodle, so an answer engine can quote it alone; then an
 * FAQ block (FAQPage data from the same list). Unit-tested to the FAQ's rules. Brand voice: lowercase
 * and warm in the furniture, plain sentences in the answers; no "AI", no pushy upsell, no urgency
 * theatre — the deadline is reassurance.
 */
import { CHRISTMAS_LAST_ORDER } from './season';
import { FAQ, longDate, type FaqItem } from './faq';

/** When these pages were last checked against the products + dates (shown, and in the schema). */
export const CHRISTMAS_PAGES_UPDATED = '2026-10-27';

/** The newest Christmas the date table knows (the pages always talk about the coming one). */
const TABLE_YEAR = Math.max(...Object.keys(CHRISTMAS_LAST_ORDER).map(Number));
const XMAS = CHRISTMAS_LAST_ORDER[TABLE_YEAR]!.byRoute;

/** An item from the main FAQ, reused word for word (one source per answer). */
const faq = (id: string): FaqItem => {
  const it = FAQ.flatMap((s) => s.items).find((x) => x.id === id);
  if (!it) throw new Error(`no FAQ item ${id}`);
  return it;
};

export interface ChristmasPage {
  /** /christmas/<slug> */
  slug: string;
  /** The search question the page exists to answer. */
  question: string;
  h1: string;
  /** The one handwritten (Gaegu) moment on the page. */
  note: string;
  metaTitle: string;
  metaDescription: string;
  /** Opens with ONE self-contained sentence that answers `question` and names Snickerdoodle. */
  answer: string;
  /** A little more, in plain words. `[label](/path)` links. */
  more: string[];
  /** The products this page is about, most relevant first (only those on show appear). */
  products: string[];
  faq: FaqItem[];
}

export const CHRISTMAS_PAGES: ChristmasPage[] = [
  {
    slug: 'personalised-ornaments',
    question: 'personalised christmas ornament from a child’s drawing',
    h1: 'Personalised Christmas ornaments from their drawings',
    note: 'one for every christmas they’re little',
    metaTitle: 'Personalised Christmas ornaments from your child’s drawing',
    metaDescription: 'Turn your child’s drawing into a Christmas tree ornament: a glossy ceramic disc or a shatterproof bauble printed on both sides. Made in the UK, free UK delivery.',
    answer:
      'Snickerdoodle turns your child’s drawing into a personalised Christmas ornament for the tree, either a glossy ceramic disc on a gold string or a shatterproof bauble printed on both sides. You upload a photo of the drawing, see it on the ornament straight away, and it’s made to order in the UK.',
    more: [
      'Lots of families make a new one every year, so the tree slowly fills up with a timeline of their drawings — the wobbly star from when they were three, the reindeer from when they were six.',
      'The ceramic ornament is a flat 7.5 cm disc, printed on one side. The bauble is an 8 cm clear plastic ball with a chrome cap — it won’t break if little hands drop it.',
    ],
    products: ['ceramicOrnament', 'christmasBauble'],
    faq: [
      faq('christmas-bauble'),
      {
        id: 'ornament-ceramic-or-bauble',
        q: 'Should I choose the ceramic ornament or the plastic bauble?',
        a: 'Snickerdoodle’s ceramic ornament is the keepsake one: a glossy flat disc on a gold string, printed on one side. The plastic bauble is the family-proof one: a shatterproof 8 cm ball printed on both sides, so it looks right from every angle. Both are made in the UK with free delivery.',
      },
      {
        id: 'ornament-name-year',
        q: 'Can I add my child’s name and the year to the ornament?',
        a: 'Yes — in the Snickerdoodle studio you can add a first name and the year beside the drawing, in a handwriting-style font, so every ornament says whose it is and which Christmas it’s from. We only ever ask for a child’s first name, never a surname.',
      },
      {
        id: 'ornament-last-order',
        q: 'When do I need to order a Snickerdoodle ornament for Christmas?',
        a: `Snickerdoodle’s last order date for the ceramic ornament is ${longDate(XMAS.uk9)}, and for the plastic bauble ${longDate(XMAS.uk5)}. They’re safe dates with time to make and post it; every date is on [our Christmas dates page](/christmas/delivery-dates).`,
      },
    ],
  },
  {
    slug: 'cards',
    question: 'christmas cards from my child’s drawing',
    h1: 'Christmas cards from your child’s drawings',
    note: 'this year’s card is by them',
    metaTitle: 'Christmas cards made from your child’s drawing',
    metaDescription: 'Make your family’s Christmas cards from your child’s drawings: packs of 5 or 10 with a different drawing on every card, blank inside, envelopes included. Made in the UK.',
    answer:
      'Snickerdoodle makes Christmas cards from your child’s own drawings, in packs of 5 or 10 with a different drawing on the front of every card if you like, or as a single card with a printed message inside. Each is a folded 7×5″ card with an envelope, made to order in the UK.',
    more: [
      'It’s the family’s own Christmas card, drawn by the smallest member of the family. Pack cards are blank inside for your own words; a single card can carry a printed message.',
      'Cards travel by standard post, so they close for Christmas a few days before everything else — see the [Christmas dates](/christmas/delivery-dates).',
    ],
    products: ['cardPack', 'card'],
    faq: [
      faq('cards'),
      {
        id: 'cards-different-drawings',
        q: 'Can every card in a Snickerdoodle pack have a different drawing?',
        a: 'Yes — in a Snickerdoodle card pack you choose a drawing for each card, so a pack of 10 can carry ten different pictures, or the same one on every card if there’s a favourite. Brothers, sisters and cousins can each draw a few.',
      },
      {
        id: 'cards-last-order',
        q: 'When is the last day to order Snickerdoodle Christmas cards?',
        a: `Snickerdoodle’s last order date for Christmas cards and card packs is ${longDate(XMAS.uk7)}, a few days before everything else, because cards go by standard post. Order by then and they arrive in time to write and send. All the dates are on [our Christmas dates page](/christmas/delivery-dates).`,
      },
    ],
  },
  {
    slug: 'wrapping-paper',
    question: 'wrapping paper with my child’s drawing',
    h1: 'Wrapping paper made from your child’s drawing',
    note: 'every present wrapped in their art',
    metaTitle: 'Wrapping paper printed with your child’s drawing',
    metaDescription: 'Turn your child’s drawing into a repeating pattern on proper gift wrap — white or brown kraft, on a 70 cm roll of 2, 3 or 5 metres. Made in the UK.',
    answer:
      'Snickerdoodle turns your child’s drawing into wrapping paper, printing it as a repeating pattern on a 70 cm-wide roll of 2, 3 or 5 metres, on white or brown kraft paper. You choose how big the drawings are and what colour they sit on, and the paper is made to order in the UK.',
    more: [
      'The paper ends up being half the present. On kraft the colours come out a little earthier, and the brown shows through wherever the drawing is white.',
      'Wrapping paper goes by standard post — check the [Christmas dates](/christmas/delivery-dates) so it arrives before the wrapping marathon.',
    ],
    products: ['wrappingPaper'],
    faq: [
      faq('socks-wrapping-paper'),
      {
        id: 'wrap-white-or-kraft',
        q: 'What’s the difference between white and kraft Snickerdoodle wrapping paper?',
        a: 'Snickerdoodle’s white wrapping paper keeps the drawing’s colours bright and lets you choose the colour behind it; the brown kraft paper gives an earthier, scrapbook look, with the brown showing through wherever the drawing is white. Both are FSC-certified 95gsm paper.',
      },
      {
        id: 'wrap-last-order',
        q: 'When should I order Snickerdoodle wrapping paper for Christmas?',
        a: `Snickerdoodle’s last order date for wrapping paper is ${longDate(XMAS.gb2)}, so it arrives in time for the wrapping. Every date is on [our Christmas dates page](/christmas/delivery-dates).`,
      },
    ],
  },
  {
    slug: 'gifts-for-grandparents',
    question: 'christmas gifts for grandparents from grandchildren',
    h1: 'Christmas gifts for grandparents, drawn by the grandchildren',
    note: 'they’ll cry, in a good way',
    metaTitle: 'Christmas gifts for grandparents from the grandchildren',
    metaDescription: 'The present grandparents keep: their grandchild’s drawing on an ornament, a mug, a tea towel, a framed print or the 2027 calendar. Made in the UK, free delivery.',
    answer:
      'Snickerdoodle’s Christmas gifts for grandparents are made from the grandchildren’s own drawings: an ornament for the tree, a mug, a tea towel, a framed print or a 2027 calendar with a drawing for every month. Each one is made to order in the UK and delivered free.',
    more: [
      'It’s the present they made themselves — and it isn’t more plastic. Grandparents keep these.',
      'Want them to choose? Share a private ready-to-buy link: they tap it, the basket’s already filled, and they check out as a guest. See [how gift links work](/gifts).',
    ],
    products: ['calendar', 'ceramicOrnament', 'mug', 'framedPrint', 'teaTowel', 'cushion', 'blanket', 'jigsaw'],
    faq: [
      faq('christmas-grandparents'),
      faq('grandparents-buy'),
      {
        id: 'grandparents-calendar',
        q: 'How does the Snickerdoodle 2027 calendar work as a gift?',
        a: 'The Snickerdoodle 2027 calendar puts a different one of your child’s drawings on every month, plus one on the cover, in A5 or A4 — so grandparents get a new picture to look at every few weeks all year. If you only have one drawing, it can go on every month.',
      },
    ],
  },
  {
    slug: 'teacher-gifts',
    question: 'christmas gift for teacher from child',
    h1: 'Christmas gifts for teachers, drawn by the class’s biggest fan',
    note: 'for the best teacher ever',
    metaTitle: 'Christmas teacher gifts made from your child’s drawing',
    metaDescription: 'A small Christmas thank-you for a teacher or nursery keyworker: a mug, tea towel or card with your child’s own drawing on it. Made in the UK, free delivery.',
    answer:
      'Snickerdoodle makes a small Christmas gift for a teacher from your child’s own drawing, on a mug, a tea towel or a greetings card. It’s personal without being much, and it’s made to order in the UK with free delivery.',
    more: [
      'Teachers and nursery keyworkers are given a lot of candles. A mug with a drawing of the class guinea pig, signed with a first name, is the one they keep on their desk.',
      'Term usually ends a few days before Christmas, so order by the [Christmas dates](/christmas/delivery-dates) and it arrives before the last day.',
    ],
    products: ['mug', 'teaTowel', 'card'],
    faq: [
      {
        id: 'teacher-what-to-give',
        q: 'What’s a good Christmas gift for a teacher from a child?',
        a: 'Snickerdoodle’s favourite teacher gift is something with the child’s own drawing on it, like a mug for the staffroom, a tea towel, or a card with a printed thank-you inside. It costs less than a hamper and gets kept far longer.',
      },
      {
        id: 'teacher-name',
        q: 'Can my child sign a Snickerdoodle teacher gift?',
        a: 'Yes — in the Snickerdoodle studio you can add “from” and your child’s first name beside the drawing, or photograph a drawing they’ve already signed. We only ever ask for a first name, never a surname, so nothing more than that is printed.',
      },
      faq('christmas-last-order'),
    ],
  },
];

export const christmasPage = (slug: string): ChristmasPage | undefined => CHRISTMAS_PAGES.find((p) => p.slug === slug);

/** Every Christmas page path (the hub, the intent pages, the dates page) — for the sitemap + allowlist. */
export const CHRISTMAS_PATHS: string[] = ['/christmas', ...CHRISTMAS_PAGES.map((p) => `/christmas/${p.slug}`), '/christmas/delivery-dates'];

/** The hub's shelves, by who it's for (strategy §2: the child is the artist, everyone else the recipient). */
export const CHRISTMAS_SHELVES: { id: string; label: string; line: string; page?: string; keys: string[] }[] = [
  { id: 'for-the-tree', label: 'for the tree', line: 'this year’s ornament, the cards and the wrap', page: 'personalised-ornaments', keys: ['ceramicOrnament', 'christmasBauble', 'cardPack', 'wrappingPaper', 'sack'] },
  { id: 'grandparents', label: 'grandparents', line: 'the present they’ll actually keep', page: 'gifts-for-grandparents', keys: ['calendar', 'ceramicOrnament', 'mug', 'framedPrint', 'teaTowel', 'cushion'] },
  { id: 'teachers', label: 'teachers', line: 'a little thank-you for the end of term', page: 'teacher-gifts', keys: ['mug', 'teaTowel', 'card'] },
  { id: 'the-whole-family', label: 'the whole family', line: 'matching tees, card nights, christmas eve', keys: ['sack', 'kidsTee', 'adultTee', 'socks', 'playingCards', 'jigsaw'] },
];

/**
 * ── SLOT: the Christmas bundles ──
 * The "Christmas family bundle" and "Christmas Eve bundle" are being built in another session
 * (feat/christmas-family-bundle, priced server-side there). They appear on the hub ONLY when their
 * public page exists: set `href` to it then. Until then the slot renders nothing — no "coming soon"
 * teaser, no link to a page that isn't there.
 */
export const CHRISTMAS_BUNDLE_SLOT: { key: string; name: string; line: string; href: string | null }[] = [
  { key: 'christmasBundle', name: 'christmas family bundle', line: 'a little something for everyone, from one drawing', href: null },
  { key: 'christmasEveBundle', name: 'christmas eve bundle', line: 'everything for the night before', href: null },
];

/** The hub's own questions: the main FAQ's Christmas section + the safety one (our edge). */
export const CHRISTMAS_HUB_FAQ: FaqItem[] = [...(FAQ.find((s) => s.id === 'christmas')?.items ?? []), faq('is-it-private')];
