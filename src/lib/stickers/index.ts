import { CHRISTMAS_STICKER_SVG } from './christmas-art';
import { EVERYDAY_STICKER_SVG } from './everyday-art';

/**
 * The Studio's stickers — multi-colour, hand-drawn vector art with an ink line, straight on the
 * canvas (no white die-cut border or shadow — founder, 26 Oct). The manifest is the ONLY list the server accepts: a saved sticker
 * is an id + placement, never client SVG, and both the live preview and the print render draw the
 * same SVG string for that id (preview == print).
 *
 * The Christmas family comes back every year (offered in season; always printable). Art:
 * scripts/stickers/christmas.mjs → src/ui/studio/stickers/christmas/*.svg + ./christmas-art.ts.
 * The everyday doodles (heart, sun, rainbow …) are offered all year: ./everyday-art.ts.
 */
export type StickerId = keyof typeof CHRISTMAS_STICKER_SVG | keyof typeof EVERYDAY_STICKER_SVG;
export type StickerSet = 'christmas' | 'everyday';

export interface StickerDef {
  id: StickerId;
  set: StickerSet;
  /** What it's called, to a parent and to a screen reader ("add reindeer sticker"). */
  label: string;
}

/** In drawer order: the characters first (the gingerbread man — our mascot — leads), then the trimmings. */
export const STICKERS: StickerDef[] = [
  { id: 'gingerbread', set: 'christmas', label: 'gingerbread man' },
  { id: 'reindeer', set: 'christmas', label: 'reindeer' },
  { id: 'snowman', set: 'christmas', label: 'snowman' },
  { id: 'santa', set: 'christmas', label: 'santa' },
  { id: 'mrsClaus', set: 'christmas', label: 'mrs claus' },
  { id: 'penguin', set: 'christmas', label: 'penguin' },
  { id: 'star', set: 'christmas', label: 'star' },
  { id: 'holly', set: 'christmas', label: 'holly' },
  { id: 'candyCane', set: 'christmas', label: 'candy cane' },
  { id: 'tinsel', set: 'christmas', label: 'tinsel' },
  { id: 'sack', set: 'christmas', label: 'christmas sack' },
  { id: 'present', set: 'christmas', label: 'present' },
  // everyday doodles, all year round
  { id: 'heart', set: 'everyday', label: 'heart' },
  { id: 'happyStar', set: 'everyday', label: 'happy star' },
  { id: 'sun', set: 'everyday', label: 'sunshine' },
  { id: 'rainbow', set: 'everyday', label: 'rainbow' },
  { id: 'flower', set: 'everyday', label: 'flower' },
  { id: 'crown', set: 'everyday', label: 'crown' },
  { id: 'cloud', set: 'everyday', label: 'cloud' },
  { id: 'sparkle', set: 'everyday', label: 'sparkle' },
  { id: 'squiggle', set: 'everyday', label: 'squiggle' },
];
/** One drawer's stickers, in drawer order. */
export const stickersIn = (set: StickerSet) => STICKERS.filter((s) => s.set === set);
export const STICKER_IDS = STICKERS.map((s) => s.id);
export const isStickerId = (v: unknown): v is StickerId => typeof v === 'string' && (STICKER_IDS as string[]).includes(v);
export const stickerLabel = (id: StickerId) => STICKERS.find((s) => s.id === id)?.label ?? 'sticker';

/** The sticker's SVG (a 200 × 200 view box — square, so a sticker's box is size × size). */
export const stickerSvg = (id: StickerId): string => (Object.hasOwn(EVERYDAY_STICKER_SVG, id) ? EVERYDAY_STICKER_SVG[id as keyof typeof EVERYDAY_STICKER_SVG] : CHRISTMAS_STICKER_SVG[id as keyof typeof CHRISTMAS_STICKER_SVG]);
/** As a data: URL, for an <img> or the canvas (each SVG stands alone — its ids never collide). */
export const stickerDataUrl = (id: StickerId) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(id))}`;
