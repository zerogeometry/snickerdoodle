/**
 * Products whose print file is a seamless REPEAT of the drawing — the 'pattern' magic edit
 * (src/server/print/pattern.ts). Client-safe, so the customize page, the positioner, the order gate
 * and the renderer all agree on which products repeat.
 */
export const PATTERN_PRODUCT_KEYS = ['socks', 'wrappingPaper', 'teaTowel'] as const;
/** Is this a repeat-pattern product? Takes a product key OR a variant sku (`socks-tube`). */
export const isPatternProduct = (key: string | null | undefined): boolean => !!key && PATTERN_PRODUCT_KEYS.some((k) => key === k || key.startsWith(`${k}-`));

/**
 * Products printed EDGE TO EDGE — the whole visible face is printable — so a BASE COLOUR can fill
 * all of it, under the drawing (founder, 22 Oct: "for all items that allow us to print all over").
 * The repeats, plus: the phone case (wraps round the sides), cushions (sublimated, the whole face),
 * the fleece blanket, the jigsaw, the framed print (the paper fills the frame), the playing cards'
 * backs and the pet bandana. NOT the mug (its wrap stops short of the handle), garments (DTG on the
 * fabric's own colour), nor the bauble, sack, apron or height chart (a printed panel / the ruler band).
 * The greetings card and the card pack take it on the OUTSIDE only: the outer front panel (and the
 * outer rear too when the drawing spans the whole outside) — the inside stays white for the words
 * (cardPrint.ts).
 */
export const GROUND_PRODUCT_KEYS = [...PATTERN_PRODUCT_KEYS, 'phoneCase', 'cushion', 'blanket', 'jigsaw', 'framedPrint', 'playingCards', 'petBandana', 'card', 'cardPack'] as const;
/** Can this product sit on a base colour? Takes a product key OR a variant sku (`cushion-heart`). */
export const isGroundProduct = (key: string | null | undefined): boolean => !!key && GROUND_PRODUCT_KEYS.some((k) => key === k || key.startsWith(`${k}-`));

/**
 * The BASE COLOUR: ANY colour, picked on a colour wheel (founder, 22 Oct — a full wheel, not a set).
 * Stored and sent as lowercase `#rrggbb`; white (and anything unreadable) means "no base colour",
 * which keeps every existing key, line and file exactly as it was. Lines saved before the wheel
 * carry a palette WORD (`navy`) — still honoured, as the colour it always was.
 */
export const PATTERN_GROUND_WHITE = '#ffffff';
const LEGACY_GROUND_WORDS: Record<string, string> = {
  white: '#ffffff', cream: '#f4ebda', sunshine: '#f6c445', tomato: '#c8402a', berry: '#e8786e',
  sky: '#8fb5d6', leaf: '#7fa65e', grey: '#9c9a96', navy: '#26334f', black: '#1f1c1a',
};

/** A real, non-white base colour as lowercase `#rrggbb`, or null (white / none / junk). Server-side
 * source of truth — never trust the client's value. */
export function normalizeGround(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const hex = /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : LEGACY_GROUND_WORDS[raw] ?? null;
  return hex && hex !== PATTERN_GROUND_WHITE ? hex : null;
}

/** The fill for a print file / preview: the base colour, white for none. */
export const groundHex = (raw: unknown): string => normalizeGround(raw) ?? PATTERN_GROUND_WHITE;

/** A coloured (non-white) base? Only these change a line's identity, cache keys, file names and labels. */
export const isColouredGround = (raw: unknown): raw is string => normalizeGround(raw) !== null;

/** The part a base colour adds to a cache key / file name / line id ('' for white). */
export const groundTag = (raw: unknown): string => {
  const g = normalizeGround(raw);
  return g ? `-g${g.slice(1)}` : '';
};

/** A friendly name for a picked colour ("deep red", "light blue", "cream") — basket lines + labels. */
export function colourName(raw: unknown): string {
  const hex = groundHex(raw);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (s < 0.15 || d < 0.06) return l > 0.93 ? 'white' : l > 0.8 ? (r > b + 0.03 ? 'cream' : 'pale grey') : l > 0.35 ? 'grey' : l > 0.12 ? 'charcoal' : 'black';
  let h = d === 0 ? 0 : max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (l > 0.85 && h >= 20 && h < 70) return 'cream'; // the palest warm yellows read as cream
  const base =
    h < 12 || h >= 345 ? 'red' : h < 40 ? (l < 0.4 ? 'brown' : 'orange') : h < 65 ? (l < 0.35 ? 'olive' : 'yellow') : h < 160 ? 'green' : h < 190 ? 'teal' : h < 215 ? 'sky blue' : h < 255 ? 'blue' : h < 290 ? 'purple' : 'pink';
  if (base === 'blue' && l < 0.3) return 'navy';
  if (base === 'red' && l < 0.3) return 'burgundy';
  return l < 0.3 ? `deep ${base}` : l > 0.75 ? `light ${base}` : base;
}
