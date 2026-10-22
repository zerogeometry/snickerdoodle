import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { colourName, groundHex, groundTag, isColouredGround, isGroundProduct, normalizeGround } from '@/lib/patterns';
import { hexToHsv, hsvToHex } from '@/ui/primitives/ColourWheel';
import { isLineOfSku, lineIdFor, lineIdForSku, productQtyInBasket } from '@/lib/catalogue-view';
import { orderItemsFor, type BasketItem } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';
import { clampTransform } from '@/server/print/geometry';
import { renderRepeatPattern } from '@/server/print/pattern';

describe('base colours — any colour off the wheel, checked on the server', () => {
  it('a colour code is kept (lowercase); white and junk mean "no base colour"', () => {
    expect(normalizeGround('#C8402A')).toBe('#c8402a');
    expect(normalizeGround('#0b6623')).toBe('#0b6623');
    for (const none of ['#ffffff', '#FFFFFF', 'white', '#fff', 'c8402a', '#12345g', 'NAVY', 'both', '', null, undefined, 42, { hex: '#000000' }, '#000000; drop']) {
      expect(normalizeGround(none)).toBeNull();
      expect(groundHex(none)).toBe('#ffffff');
      expect(groundTag(none)).toBe('');
    }
  });

  it('lines saved before the wheel (a palette word) still print the colour they always were', () => {
    expect(normalizeGround('navy')).toBe('#26334f');
    expect(normalizeGround('tomato')).toBe('#c8402a');
    expect(normalizeGround('white')).toBeNull();
  });

  it('only a real non-white colour counts as coloured, and it names its file / key', () => {
    expect(isColouredGround('#0b6623')).toBe(true);
    expect(isColouredGround('#ffffff')).toBe(false);
    expect(isColouredGround(undefined)).toBe(false);
    expect(groundTag('#0B6623')).toBe('-g0b6623'); // no '#' in a storage key
  });

  it('only EDGE-TO-EDGE products take a base colour (the whole face must be printable)', () => {
    for (const k of ['socks', 'socks-tube', 'wrappingPaper', 'teaTowel', 'phoneCase', 'cushion', 'cushion-heart', 'blanket', 'jigsaw', 'framedPrint', 'playingCards', 'petBandana']) expect(isGroundProduct(k), k).toBe(true);
    // the mug's wrap stops at the handle; garments print on the fabric's own colour; panels + the ruler band
    for (const k of ['mug', 'kidsTee', 'adultTee', 'kidsHoodie', 'babyBodysuit', 'bauble', 'sack', 'apron', 'heightChart', 'card', 'cardPack', 'calendar', null, undefined, '']) expect(isGroundProduct(k), String(k)).toBe(false);
  });

  it('a picked colour gets a friendly name for the basket line', () => {
    expect(colourName('#c8402a')).toBe('red');
    expect(colourName('#0b6623')).toBe('deep green');
    expect(colourName('#26334f')).toBe('navy');
    expect(colourName('#6e2232')).toBe('burgundy');
    expect(colourName('#ffffff')).toBe('white');
    expect(colourName('#1f1c1a')).toBe('black');
    expect(colourName('#f4ebda')).toBe('cream');
    expect(colourName('#8fb5d6')).toBe('sky blue');
  });

  it('the wheel’s colour maths round-trips', () => {
    for (const hex of ['#c8402a', '#0b6623', '#26334f', '#f6c445', '#000000', '#ffffff', '#7f7f7f']) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
  });
});

describe('basket lines — red socks and navy socks are two lines, not "2 × red"', () => {
  const socks = { key: 'socks', variants: [{ sku: 'socks' }, { sku: 'socks-tube' }] } as unknown as CatalogueProduct;
  const line = (id: string, qty: number, ground?: string): BasketItem => ({ id, name: 'socks', product: 'socks', pricePence: 2000, qty, ...(ground ? { ground } : {}) });

  it('white keeps the plain variant id (existing lines + quick-add unchanged); a colour gets its own', () => {
    expect(lineIdFor('socks', '#ffffff')).toBe(lineIdForSku('socks'));
    expect(lineIdFor('socks', undefined)).toBe(lineIdForSku('socks'));
    expect(lineIdFor('socks', '#26334f')).toBe(`${lineIdForSku('socks')}~26334f`);
    expect(lineIdFor('socks', '#26334f')).not.toBe(lineIdFor('socks', '#c8402a'));
    expect(lineIdFor('socks', 'not a colour')).toBe(lineIdForSku('socks')); // junk never forks a line
  });

  it('every colour of a variant still belongs to it — and only to it', () => {
    expect(isLineOfSku(lineIdFor('socks', '#26334f'), 'socks')).toBe(true);
    expect(isLineOfSku(lineIdForSku('socks'), 'socks')).toBe(true);
    expect(isLineOfSku(lineIdFor('socks-tube', '#26334f'), 'socks')).toBe(false);
  });

  it('the shop tile counts every colour', () => {
    const items = [line(lineIdForSku('socks'), 1), line(lineIdFor('socks', '#26334f'), 2, '#26334f'), line(lineIdFor('socks-tube', '#c8402a'), 1, '#c8402a')];
    expect(productQtyInBasket(items, socks)).toBe(4);
  });

  it('the order request carries the colour with the drawing (the server normalises it)', () => {
    const item = { ...line(lineIdFor('socks', '#26334f'), 1, '#26334f'), sku: 'socks', artwork: { assetId: 'a1', transform: { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 } } } as BasketItem;
    expect(orderItemsFor([item])[0]).toMatchObject({ productKey: 'socks', artwork: { assetId: 'a1', ground: '#26334f' } });
  });
});

describe('the print file — the repeat sits on the base colour, edge to edge', () => {
  // a see-through drawing (lifted off its paper): a small red blob
  const cutout = async () =>
    sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="30" fill="#c8402a"/></svg>')).png().toBuffer();

  it('every pixel the drawing doesn’t cover is the chosen colour', async () => {
    const navy = groundHex('#26334f');
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
