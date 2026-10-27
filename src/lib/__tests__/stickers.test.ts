import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHRISTMAS_STICKER_SVG } from '@/lib/stickers/christmas-art';
import { EVERYDAY_IDS } from '@/lib/stickers/everyday-art';
import { isStickerId, STICKER_IDS, STICKERS, stickersIn, stickerSvg } from '@/lib/stickers';
import { cleanObjects, MAX_OBJECTS, MAX_STICKER_SIZE, rotateObjects, type StickerObject } from '@/lib/studio-objects';
import { CARD_FONTS, normalizeCardFont, pickerFonts } from '@/lib/card-fonts';

const DIR = path.resolve(__dirname, '../../ui/studio/stickers/christmas');

describe('the Christmas sticker family: manifest ↔ art', () => {
  it('twelve stickers, one SVG file each, and the art module is exactly those files', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.svg')).map((f) => f.replace(/\.svg$/, '')).sort();
    const christmas = stickersIn('christmas').map((s) => s.id);
    expect(christmas).toHaveLength(12);
    expect([...christmas].sort()).toEqual(files);
    expect(Object.keys(CHRISTMAS_STICKER_SVG).sort()).toEqual(files);
    for (const id of christmas) expect(stickerSvg(id)).toBe(readFileSync(path.join(DIR, `${id}.svg`), 'utf8').trim());
    // the manifest is the christmas family + the everyday doodles, nothing else
    expect([...STICKER_IDS].sort()).toEqual([...christmas, ...EVERYDAY_IDS].sort());
  });

  it('each is a self-contained square SVG: no scripts, no external links, ids prefixed so they never collide', () => {
    for (const id of STICKER_IDS) {
      const svg = stickerSvg(id);
      expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 200 200" width="200" height="200">/);
      expect(svg).not.toMatch(/<script|<foreignObject|on[a-z]+=|href="(?!#)|url\((?!#)/i);
      for (const [, defined] of svg.matchAll(/ id="([^"]+)"/g)) expect(defined!.startsWith(`${id}-`)).toBe(true);
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
