import { describe, expect, it } from 'vitest';
import { CASE_PRICE_PENCE, PHONE_MODELS, caseDefaultTransform, gradesFor, prodigiCaseSku, searchPhones } from '@/lib/phone-cases';
import { clampTransform, computeLayerRect } from '@/server/print/geometry';

const names = (q: string) => searchPhones(q).map((m) => m.name);
const top = (q: string) => names(q)[0];

describe('phone search — finds the phone however it is typed', () => {
  it('exact names, any case, with or without spaces', () => {
    expect(top('iPhone 16 Pro')).toBe('iPhone 16 Pro');
    expect(top('iphone16pro')).toBe('iPhone 16 Pro');
    expect(top('IPHONE 15')).toBe('iPhone 15');
    expect(top('16 pro max')).toBe('iPhone 16 Pro Max');
  });
  it('the shorter model leads ("16 pro" before "16 pro max")', () => {
    expect(names('16 pro').slice(0, 2)).toEqual(['iPhone 16 Pro', 'iPhone 16 Pro Max']);
  });
  it('Samsung shorthand: samsung / galaxy / s24 / s24u / s24+ / ultra', () => {
    expect(top('samsung s24 ultra')).toBe('Galaxy S24 Ultra');
    expect(top('s24u')).toBe('Galaxy S24 Ultra');
    expect(top('galaxy s23+')).toBe('Galaxy S23+');
    expect(top('S25 plus')).toBe('Galaxy S25+');
    expect(top('s26')).toBe('Galaxy S26');
  });
  it('lists while still typing — "iphone 1" already shows iPhones, newest first', () => {
    const r = names('iphone 1');
    expect(r.length).toBeGreaterThan(3);
    expect(r[0]).toMatch(/^iPhone 1[78]/);
  });
  it('a brand alone lists that brand, newest first', () => {
    expect(names('pixel')).toEqual(['Pixel 9', 'Pixel 9 Pro', 'Pixel 9 Pro XL', 'Pixel 8', 'Pixel 8 Pro']);
    expect(names('pixel').every((n) => n.startsWith('Pixel'))).toBe(true);
    expect(names('google')[0]).toMatch(/^Pixel/);
  });
  it('phones we can’t make for come back empty (the page says so)', () => {
    expect(names('iphone 11')).toEqual([]);
    expect(names('nokia 3310')).toEqual([]);
    expect(names('ipad')).toEqual([]);
    expect(names('')).toEqual([]);
  });
});

describe('phone case SKUs and grades', () => {
  it('builds Prodigi’s exact SKUs', () => {
    const ip16 = PHONE_MODELS.find((m) => m.name === 'iPhone 16')!;
    expect(prodigiCaseSku(ip16, 'snap', 'gloss')).toBe('GLOBAL-TECH-IP16-CS-G');
    expect(prodigiCaseSku(ip16, 'tough', 'matte')).toBe('GLOBAL-TECH-IP16-TCB-CS-M');
  });
  it('only offers the grades Prodigi makes for that phone', () => {
    expect(gradesFor('iPhone 16')).toEqual(['snap', 'tough']);
    expect(gradesFor('Pixel 9')).toEqual(['tough']);
    expect(gradesFor('iPhone 16e')).toEqual(['tough']);
    expect(gradesFor('Nokia')).toEqual([]);
  });
  it('every model has at least one grade, and prices are the founder’s', () => {
    for (const m of PHONE_MODELS) expect(m.snap || m.tough, m.name).toBeTruthy();
    expect(CASE_PRICE_PENCE).toEqual({ snap: 2499, tough: 2999 });
  });
});

describe('default placement keeps the drawing clear of the camera', () => {
  const geom = (name: string, grade: 'snap' | 'tough') => {
    const px = PHONE_MODELS.find((m) => m.name === name)![grade]!;
    return { printWidthPx: px.w, printHeightPx: px.h, bleedMm: 0, requiredDpi: 300, cam: px.cam };
  };
  for (const [name, grade, src] of [
    ['iPhone 16', 'snap', { width: 2000, height: 1500 }], // a wide drawing
    ['Galaxy S25 Ultra', 'tough', { width: 1500, height: 2100 }], // a tall one (A4-ish)
    ['Pixel 9', 'tough', { width: 1800, height: 1800 }], // square
  ] as const) {
    it(`${name} ${grade}: the whole ${src.width}×${src.height} drawing sits below the camera, inside the safe edges`, () => {
      const t = caseDefaultTransform(name, grade, src)!;
      const g = geom(name, grade);
      const r = computeLayerRect(g, src, clampTransform(t)); // the SAME geometry the print file uses
      expect(r.y).toBeGreaterThanOrEqual(Math.floor(g.cam * g.printHeightPx)); // below the camera
      expect(r.y + r.height).toBeLessThanOrEqual(Math.ceil(0.96 * g.printHeightPx)); // above the bottom edge
      expect(r.x).toBeGreaterThanOrEqual(Math.floor(0.06 * g.printWidthPx));
      expect(r.x + r.width).toBeLessThanOrEqual(Math.ceil(0.94 * g.printWidthPx));
      expect(r.width / r.height).toBeCloseTo(src.width / src.height, 1); // the whole drawing, not a crop
    });
  }
  it('no placement without a known phone or an image size', () => {
    expect(caseDefaultTransform('Nokia', 'snap', { width: 10, height: 10 })).toBeNull();
    expect(caseDefaultTransform('Pixel 9', 'snap', { width: 10, height: 10 })).toBeNull(); // tough-only
    expect(caseDefaultTransform('iPhone 16', 'snap', null)).toBeNull();
  });
});
