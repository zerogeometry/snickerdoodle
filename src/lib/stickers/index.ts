import { CHRISTMAS_STICKER_SVG } from './christmas-art';

/**
 * The Studio's stickers — multi-colour, hand-drawn vector art (scrapbook finish: ink line, white
 * die-cut border, soft shadow). The manifest is the ONLY list the server accepts: a saved sticker
 * is an id + placement, never client SVG, and both the live preview and the print render draw the
 * same SVG string for that id (preview == print).
 *
 * The Christmas family comes back every year (offered in season; always printable). Art:
 * scripts/stickers/christmas.mjs → src/ui/studio/stickers/christmas/*.svg + ./christmas-art.ts.
 */
export type StickerId = keyof typeof CHRISTMAS_STICKER_SVG;
export type StickerSet = 'christmas';

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
];
export const STICKER_IDS = STICKERS.map((s) => s.id);
export const isStickerId = (v: unknown): v is StickerId => typeof v === 'string' && (STICKER_IDS as string[]).includes(v);
export const stickerLabel = (id: StickerId) => STICKERS.find((s) => s.id === id)?.label ?? 'sticker';

/** The sticker's SVG (a 200 × 200 view box — square, so a sticker's box is size × size). */
export const stickerSvg = (id: StickerId): string => CHRISTMAS_STICKER_SVG[id];
/** As a data: URL, for an <img> or the canvas (each SVG stands alone — its ids never collide). */
export const stickerDataUrl = (id: StickerId) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(stickerSvg(id))}`;
