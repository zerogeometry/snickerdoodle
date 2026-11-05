/**
 * The Studio's stickers — children's felt-tip doodles (wobbly lines, lopsided shapes, flat bold
 * colour), traced to vector so they print crisp at any size, straight on the canvas (no white
 * die-cut border or shadow — founder, 26 Oct). The manifest is the ONLY list the server accepts: a
 * saved sticker is an id + placement, never client SVG.
 *
 * Preview == print: the browser loads public/stickers/christmas/<id>.svg (stickerUrl) for the tray
 * and the canvas; the print renderer draws src/lib/stickers/art.ts → christmas-art.ts, generated from
 * those very files (a test holds them byte-identical). The art stays out of this module so the Studio's
 * JavaScript doesn't carry it.
 *
 * The Christmas family comes back every year (offered in season; always printable). Art:
 * scripts/stickers/doodle_generate.py (local Qwen Image) → doodle_trace.py → build-art.mjs.
 */
export type StickerSet = 'christmas';

/** In drawer order: the characters first (the gingerbread man — our mascot — leads), then the trimmings. */
export const STICKER_IDS = ['gingerbread', 'reindeer', 'snowman', 'santa', 'mrsClaus', 'penguin', 'star', 'holly', 'candyCane', 'tinsel', 'sack', 'present'] as const;
export type StickerId = (typeof STICKER_IDS)[number];

export interface StickerDef {
  id: StickerId;
  set: StickerSet;
  /** What it's called, to a parent and to a screen reader ("add reindeer sticker"). */
  label: string;
}

const LABELS: Record<StickerId, string> = {
  gingerbread: 'gingerbread man',
  reindeer: 'reindeer',
  snowman: 'snowman',
  santa: 'santa',
  mrsClaus: 'mrs claus',
  penguin: 'penguin',
  star: 'star',
  holly: 'holly',
  candyCane: 'candy cane',
  tinsel: 'tinsel',
  sack: 'christmas sack',
  present: 'present',
};
export const STICKERS: StickerDef[] = STICKER_IDS.map((id) => ({ id, set: 'christmas', label: LABELS[id] }));
export const isStickerId = (v: unknown): v is StickerId => typeof v === 'string' && (STICKER_IDS as readonly string[]).includes(v);
export const stickerLabel = (id: StickerId) => STICKERS.find((s) => s.id === id)?.label ?? 'sticker';

/** The sticker's art (a square 200 × 200 view box, so a sticker's box is size × size), as served to the browser. */
export const stickerUrl = (id: StickerId) => `/stickers/christmas/${id}.svg`;
