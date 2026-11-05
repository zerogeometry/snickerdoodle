import 'server-only';
import { CHRISTMAS_STICKER_SVG } from './christmas-art';
import type { StickerId } from './index';

/**
 * The sticker's SVG for the print renderer (server only — the browser loads the same file from
 * /stickers/christmas/<id>.svg, so the Studio's JavaScript never carries the art). A square
 * 200 × 200 view box; each SVG stands alone (no ids, nothing external).
 */
export const stickerSvg = (id: StickerId): string => CHRISTMAS_STICKER_SVG[id];
