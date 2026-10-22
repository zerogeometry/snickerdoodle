import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { isColouredGround, normalizePatternGround, PATTERN_GROUND_WHITE, PATTERN_GROUNDS, patternGroundHex } from '@/lib/patterns';
import { isLineOfSku, lineIdFor, lineIdForSku, productQtyInBasket } from '@/lib/catalogue-view';
import { orderItemsFor, type BasketItem } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';
import { clampTransform } from '@/server/print/geometry';
import { renderRepeatPattern } from '@/server/print/pattern';

describe('pattern base colours — a curated set, the server only accepts these', () => {
  it('white is the default, and the founder’s brand + classics are on offer', () => {
    expect(PATTERN_GROUNDS[0]!.token).toBe(PATTERN_GROUND_WHITE);
    expect(PATTERN_GROUNDS.map((g) => g.token)).toEqual(expect.arrayContaining(['white', 'black', 'navy', 'grey', 'cream', 'tomato', 'berry', 'sky', 'sunshine', 'leaf']));
    for (const g of PATTERN_GROUNDS) expect(g.hex).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('anything that isn’t a known token (a raw hex, junk, a cushion colour) means white', () => {
    expect(normalizePatternGround('navy')).toBe('navy');
    for (const bad of ['#000000', 'NAVY', 'both', '', null, undefined, 42, { token: 'navy' }]) {
      expect(normalizePatternGround(bad)).toBeNull();
      expect(patternGroundHex(bad)).toBe('#FFFFFF');
    }
    expect(patternGroundHex('navy')).toBe(PATTERN_GROUNDS.find((g) => g.token === 'navy')!.hex);
  });

  it('only a real non-white colour counts as coloured', () => {
    expect(isColouredGround('navy')).toBe(true);
    expect(isColouredGround('white')).toBe(false);
    expect(isColouredGround('#123456')).toBe(false);
    expect(isColouredGround(undefined)).toBe(false);
  });
});

describe('basket lines — red socks and navy socks are two lines, not "2 × red"', () => {
  const socks = { key: 'socks', variants: [{ sku: 'socks' }, { sku: 'socks-tube' }] } as unknown as CatalogueProduct;
  const line = (id: string, qty: number, ground?: string): BasketItem => ({ id, name: 'socks', product: 'socks', pricePence: 2000, qty, ...(ground ? { ground } : {}) });

  it('white keeps the plain variant id (existing lines + quick-add unchanged); a colour gets its own', () => {
    expect(lineIdFor('socks', 'white')).toBe(lineIdForSku('socks'));
    expect(lineIdFor('socks', undefined)).toBe(lineIdForSku('socks'));
    expect(lineIdFor('socks', 'navy')).toBe(`${lineIdForSku('socks')}~navy`);
    expect(lineIdFor('socks', 'navy')).not.toBe(lineIdFor('socks', 'tomato'));
    expect(lineIdFor('socks', '#ff0000')).toBe(lineIdForSku('socks')); // junk never forks a line
  });

  it('every colour of a variant still belongs to it — and only to it', () => {
    expect(isLineOfSku(lineIdFor('socks', 'navy'), 'socks')).toBe(true);
    expect(isLineOfSku(lineIdForSku('socks'), 'socks')).toBe(true);
    expect(isLineOfSku(lineIdFor('socks-tube', 'navy'), 'socks')).toBe(false);
  });

  it('the shop tile counts every colour', () => {
    const items = [line(lineIdForSku('socks'), 1), line(lineIdFor('socks', 'navy'), 2, 'navy'), line(lineIdFor('socks-tube', 'tomato'), 1, 'tomato')];
    expect(productQtyInBasket(items, socks)).toBe(4);
  });

  it('the order request carries the colour with the drawing (the server normalises it)', () => {
    const item = { ...line(lineIdFor('socks', 'navy'), 1, 'navy'), sku: 'socks', artwork: { assetId: 'a1', transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } } as BasketItem;
    expect(orderItemsFor([item])[0]).toMatchObject({ productKey: 'socks', artwork: { assetId: 'a1', ground: 'navy' } });
  });
});

describe('the print file — the repeat sits on the base colour, edge to edge', () => {
  // a see-through drawing (lifted off its paper): a small red blob
  const cutout = async () =>
    sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30" fill="#c8402a"/></svg>')).png().toBuffer();

  it('every pixel the drawing doesn’t cover is the chosen colour', async () => {
    const navy = patternGroundHex('navy');
    const { png } = await renderRepeatPattern(await cutout(), { width: 600, height: 600 }, 150, clampTransform({ scale: 0 }), navy);
    const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(navy.slice(i, i + 2), 16));
    let ground = 0, red = 0;
    for (let i = 0; i < info.width * info.height; i++) {
      const p = [data[i * 3]!, data[i * 3 + 1]!, data[i * 3 + 2]!];
      if (Math.abs(p[0]! - r!) <= 2 && Math.abs(p[1]! - g!) <= 2 && Math.abs(p[2]! - b!) <= 2) ground++;
      else if (p[0]! > 150 && p[1]! < 120) red++;
    }
    expect(red).toBeGreaterThan(0); // the drawing is there
    expect(ground / (info.width * info.height)).toBeGreaterThan(0.5); // and the rest is navy — no white squares
    // no white anywhere: the old white fill is gone
    let white = 0;
    for (let i = 0; i < info.width * info.height; i++) if (data[i * 3]! > 245 && data[i * 3 + 1]! > 245 && data[i * 3 + 2]! > 245) white++;
    expect(white).toBe(0);
  });
});
