import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { CHRISTMAS_STICKER_SVG } from '@/lib/stickers/christmas-art';
import { isStickerId, STICKER_IDS, STICKERS, stickerUrl } from '@/lib/stickers';
import { stickerSvg } from '@/lib/stickers/art';
import { cleanObjects, MAX_OBJECTS, MAX_STICKER_SIZE, rotateObjects, type StickerObject } from '@/lib/studio-objects';
import { CARD_FONTS, normalizeCardFont, pickerFonts } from '@/lib/card-fonts';

const PUBLIC = path.resolve(__dirname, '../../../public');
const DIR = path.join(PUBLIC, 'stickers/christmas');
const ORDER = ['gingerbread', 'reindeer', 'snowman', 'santa', 'mrsClaus', 'penguin', 'star', 'holly', 'candyCane', 'tinsel', 'sack', 'present'];
/** globals.css tokens + the family's derived browns / skin (scripts/stickers/doodle_trace.py PALETTE). */
const PALETTE = ['#2b2118', '#c8402a', '#f6c445', '#fbe9b7', '#7fa65e', '#3f6e29', '#8fb5d6', '#2f5da8', '#e8786e', '#fffbf2', '#d78a36', '#9c5327', '#fbe7cc'];

describe('the Christmas sticker family: manifest ↔ art', () => {
  it('the same twelve, in the same order with the same ids, as saved designs expect', () => {
    expect(STICKER_IDS).toEqual(ORDER);
    expect(STICKERS.map((s) => s.label)).toEqual(['gingerbread man', 'reindeer', 'snowman', 'santa', 'mrs claus', 'penguin', 'star', 'holly', 'candy cane', 'tinsel', 'christmas sack', 'present']);
  });

  it('one SVG file each, and what the browser loads is byte-for-byte what the print draws', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')).sort();
    expect([...STICKER_IDS].sort()).toEqual(files);
    expect(Object.keys(CHRISTMAS_STICKER_SVG).sort()).toEqual(files);
    for (const id of STICKER_IDS) {
      expect(stickerUrl(id)).toBe(`/stickers/christmas/${id}.svg`);
      expect(stickerSvg(id)).toBe(readFileSync(path.join(PUBLIC, stickerUrl(id)), 'utf8').trim());
    }
  });

  it('each is a self-contained square vector: paths only, no ids, scripts, links or embedded pictures', () => {
    for (const id of STICKER_IDS) {
      const svg = stickerSvg(id);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 200" width="200" height="200">/);
      expect(svg).not.toMatch(/<script|<foreignObject|<image|on[a-z]+=|href=|url\(| id=/i);
      const tags = new Set([...svg.matchAll(/<([a-z]+)[\s>/]/gi)].map((m) => m[1]));
      expect([...tags].sort()).toEqual(['g', 'path', 'svg']);
    }
  });

  it('brand colours only, and every one has the doodle ink line', () => {
    for (const id of STICKER_IDS) {
      const colours = new Set([...stickerSvg(id).matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)].map((m) => m[1]));
      for (const c of colours) expect(PALETTE, `${id} uses ${c}`).toContain(c);
      expect(colours.has('#2b2118'), `${id} has no ink line`).toBe(true);
      expect(colours.size, `${id} is more than one colour`).toBeGreaterThan(2);
    }
  });

  it('at print size: crisp, see-through round the art, centred with the same even padding', () => {
    const px = 2400; // a sticker a third of a big blanket's short side — vector, so any size is as sharp
    for (const id of STICKER_IDS) {
      const img = new Resvg(stickerSvg(id), { fitTo: { mode: 'width', value: px } }).render();
      expect([img.width, img.height]).toEqual([px, px]);
      const pix = img.pixels; // (a getter that copies: read it once)
      const a = (x: number, y: number) => pix[(y * px + x) * 4 + 3]!;
      let minX = px, minY = px, maxX = 0, maxY = 0, opaque = 0, clear = 0;
      for (let y = 0; y < px; y += 2)
        for (let x = 0; x < px; x += 2) {
          const v = a(x, y);
          if (v === 0) clear++;
          if (v > 0) [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
          if (v === 255) opaque++;
        }
      const total = (px / 2) ** 2;
      for (const [x, y] of [[0, 0], [px - 1, 0], [0, px - 1], [px - 1, px - 1]]) expect(a(x!, y!), `${id} corner`).toBe(0);
      expect(clear / total, `${id}: transparent background`).toBeGreaterThan(0.12);
      expect(opaque / total, `${id}: solid art`).toBeGreaterThan(0.12); // (the tinsel is a long, thin swag)
      // the art's longer side spans ~90% of the box (5% padding), centred on both axes
      const w = maxX - minX, h = maxY - minY;
      expect(Math.max(w, h) / px, `${id} size`).toBeGreaterThan(0.87);
      expect(Math.max(w, h) / px, `${id} size`).toBeLessThan(0.93);
      expect(Math.abs((minX + maxX) / 2 - px / 2) / px, `${id} centred across`).toBeLessThan(0.02);
      expect(Math.abs((minY + maxY) / 2 - px / 2) / px, `${id} centred down`).toBeLessThan(0.02);
    }
  });

  it('labels read as plain words for "add … sticker"', () => {
    for (const s of STICKERS) expect(s.label).toMatch(/^[a-z ]+$/);
    expect(STICKERS[0]!.id).toBe('gingerbread'); // the mascot leads the drawer
  });
});

describe('sticker objects: the server only trusts the manifest', () => {
  const raw = { id: 'st1', type: 'sticker', sticker: 'reindeer', x: 0.4, y: 0.6, size: 0.3, rotation: 15, flip: true };

  it('a known sticker survives cleaning exactly', () => {
    expect(cleanObjects([raw])).toEqual([raw]);
  });

  it('an unknown id, a path, or client SVG is dropped — never drawn', () => {
    const junk = [
      { ...raw, sticker: 'skull' },
      { ...raw, sticker: '../../etc/passwd' },
      { ...raw, sticker: '<svg onload=alert(1)>' },
      { ...raw, sticker: undefined, svg: '<svg/>' },
      { ...raw, sticker: 'toString' },
    ];
    expect(cleanObjects(junk)).toEqual([]);
    expect(isStickerId('constructor')).toBe(false);
  });

  it('sizes are clamped, flip is a real boolean, extra fields are not carried through', () => {
    const [a, b] = cleanObjects([
      { ...raw, size: 99, flip: 'yes', svg: '<svg/>' },
      { ...raw, size: -1, rotation: 9999 },
    ]) as [StickerObject, StickerObject];
    expect(a).toEqual({ ...raw, size: MAX_STICKER_SIZE, flip: false });
    expect(b.size).toBe(0.02);
    expect(b.rotation).toBe(360);
  });

  it('counts towards MAX_OBJECTS like anything else', () => {
    expect(cleanObjects(Array.from({ length: MAX_OBJECTS + 10 }, (_, i) => ({ ...raw, id: `s${i}` })))).toHaveLength(MAX_OBJECTS);
  });

  it('a quarter turn of the design carries a sticker with it', () => {
    const [r] = rotateObjects([raw as StickerObject]) as [StickerObject];
    expect([r.x, r.y, r.rotation, r.flip]).toEqual([0.4, 0.4, 105, true]);
  });
});

describe('Christmas greeting fonts', () => {
  it('three festive fonts: always valid (they still print in March), offered in pickers only in season', () => {
    const festive = CARD_FONTS.filter((f) => f.festive).map((f) => f.token);
    expect(festive).toEqual(['candy', 'swash', 'elfin']);
    for (const t of festive) expect(normalizeCardFont(t)).toBe(t);
    expect(pickerFonts(false).some((f) => f.festive)).toBe(false);
    expect(pickerFonts(true).map((f) => f.token)).toEqual(CARD_FONTS.map((f) => f.token));
  });
});
