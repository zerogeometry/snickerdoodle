import { describe, expect, it } from 'vitest';
import { CASE_PRICE_PENCE, PHONE_MODELS, gradesFor, prodigiCaseSku, searchPhones } from '@/lib/phone-cases';

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
