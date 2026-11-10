/**
 * Snickerdoodle Draw on the website: the store links, the official badge artwork, the /draw film and
 * screenshots, and which pages show the floating "get the app" bubble. One place to change them.
 */

export type DrawStore = 'appStore' | 'googlePlay';

/**
 * TODO(founder): paste each store link here the day its listing goes live, e.g.
 *   appStore:   'https://apps.apple.com/gb/app/snickerdoodle-draw/id0000000000'
 *   googlePlay: 'https://play.google.com/store/apps/details?id=…'
 * Until then the buttons say "coming soon" and link nowhere.
 */
export const DRAW_STORE_LINKS: Record<DrawStore, string | null> = {
  appStore: null,
  googlePlay: null,
};

/**
 * Apple and Google require their OWN badge artwork, unaltered ("Download on the App Store", "Get it on
 * Google Play"). Drop the official SVGs from Apple's and Google's badge pages into public/badges/ and set
 * the paths here (each new public file also goes in PUBLIC_FILES, src/lib/siteMode.ts). Until then the
 * buttons are our own plain stand-ins, which is fine while the links say "coming soon".
 */
export const DRAW_STORE_BADGES: Record<DrawStore, string | null> = {
  appStore: null, // e.g. '/badges/app-store-en-gb.svg'
  googlePlay: null, // e.g. '/badges/google-play-en-gb.svg'
};

/** Each store's own wording (their badge guidelines use exactly these lines). */
export const STORE_LABEL: Record<DrawStore, { small: string; name: string; full: string }> = {
  appStore: { small: 'Download on the', name: 'App Store', full: 'Download on the App Store' },
  googlePlay: { small: 'Get it on', name: 'Google Play', full: 'Get it on Google Play' },
};

const STORE_HOSTS: Record<DrawStore, string> = { appStore: 'apps.apple.com', googlePlay: 'play.google.com' };

/** The store link if one is set AND it really is that store (https, its own host); otherwise null, and the
 * button shows "coming soon". Guards against a typo sending parents somewhere else. */
export function storeHref(store: DrawStore, links: Record<DrawStore, string | null> = DRAW_STORE_LINKS): string | null {
  const raw = links[store];
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && u.hostname === STORE_HOSTS[store] ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The film on /draw. TODO(founder): when the film is made, put the mp4 in public/draw/ (e.g.
 * '/draw/snickerdoodle-draw.mp4', ideally 1280×720, under ~8 MB), set `src`, and add it to PUBLIC_FILES.
 * Until then the frame shows the poster with "film coming soon". Keep 16:9, or change width/height to match.
 */
export const DRAW_VIDEO: { src: string | null; poster: string; width: number; height: number; title: string } = {
  src: null,
  poster: '/draw/video-poster.webp',
  width: 1280,
  height: 720,
  title: 'a little film about Snickerdoodle Draw',
};

/** The app's store screenshots (a sample child, "Ellie": no real child's data), synced by
 * scripts/brand/sync-brand-assets.mjs. Captions follow the store listing's own. */
export const DRAW_SCREENSHOTS: { src: string; alt: string; caption: string }[] = [
  {
    src: '/draw/screens/01-today.webp',
    alt: "The app's Today screen: a hello for Ellie and this week's drawing days.",
    caption: 'today’s drawing',
  },
  {
    src: '/draw/screens/02-lesson.webp',
    alt: 'A lesson in progress: step 3 of 4, "draw a little stalk on top", with a row of crayons.',
    caption: 'step by step',
  },
  {
    src: '/draw/screens/03-reveal.webp',
    alt: "A finished pumpkin drawing in a gold frame, signed with Ellie's name and the date.",
    caption: 'framed, every time',
  },
  {
    src: '/draw/screens/04-learn.webp',
    alt: 'The Doodle Garden: a winding path of lessons, from dots and circles to a happy sun.',
    caption: '366 lessons',
  },
  {
    src: '/draw/screens/05-rewards.webp',
    alt: 'Drawing days and weeks in a row, with a sticker collection.',
    caption: 'drawing days add up',
  },
];

/**
 * Pages that show the "get the app" bubble: the browsing pages and the Keepsake Home. Never the /draw page
 * itself, checkout, the studio, making a keepsake, sign-in, account or trust pages, where it would only get
 * in the way (brand voice: no pushy upsell).
 */
const BUBBLE_PAGES: ReadonlySet<string> = new Set([
  '/',
  '/how-it-works',
  '/gifts',
  '/our-story',
  '/faq',
  '/help',
  '/christmas/delivery-dates',
  '/home',
  '/family',
]);

export function showsDrawBubble(pathname: string | null): boolean {
  if (!pathname) return false;
  const p = pathname.replace(/\/+$/, '') || '/';
  return BUBBLE_PAGES.has(p);
}

/** localStorage key: the viewer closed the bubble (a per-browser convenience; nothing is sent anywhere). */
export const DRAW_BUBBLE_HIDDEN_KEY = 'snickerdoodle.draw-bubble-hidden';
