import { describe, expect, it } from 'vitest';
import { CATALOGUE } from '@/pricing';
import { definedPriceList } from '../catalogue';

// The founder-agreed shop prices (2026-10-21: "adjust all prices to the nearest £0.50", plus the
// heart cushion +£2, 30-piece jigsaw +£1 and greetings card +50p). Server-authoritative: this is
// what the seed writes and the pricing engine charges — the client never supplies a price.
const list = definedPriceList();
const price = (sku: string) => {
  const row = list.find((r) => r.sku === sku);
  if (!row) throw new Error(`no variant ${sku}`);
  return row.pricePence;
};
const prices = (productKey: string) => [...new Set(list.filter((r) => r.productKey === productKey).map((r) => r.pricePence))].sort((a, b) => a - b);

describe('shop prices — on the nearest £0.50, never .95/.99', () => {
  // Phone cases are owned by src/lib/phone-cases.ts (CASE_PRICE_PENCE) and move to £25/£30 separately.
  const PENDING = new Set(['phoneCase']);

  it('every variant price is a multiple of 50p', () => {
    const off = list.filter((r) => !PENDING.has(r.productKey) && r.pricePence % 50 !== 0).map((r) => `${r.sku}=${r.pricePence}`);
    expect(off).toEqual([]);
  });

  it('the agreed price per product', () => {
    expect(prices('framedPrint')).toEqual([6500, 7000, 9000, 10500]);
    expect(prices('mug')).toEqual([1800]);
    expect(prices('cushion')).toEqual([2200, 3000, 3500, 4000, 4500]);
    expect(price('cushion')).toBe(2200); // heart (+£2)
    expect(price('cushion-18round')).toBe(3000);
    expect(price('cushion-12square')).toBe(3000);
    expect(price('cushion-12square-double')).toBe(3500);
    expect(price('cushion-22square')).toBe(4000);
    expect(price('cushion-22square-double')).toBe(4500);
    expect(prices('kidsTee')).toEqual([2500, 2700]);
    expect(price('kidsTee')).toBe(2500); // white
    expect(price('kidsTee-34years-black')).toBe(2700); // a colour
    expect(prices('adultTee')).toEqual([3200]);
    expect(price('jigsaw')).toBe(2600); // 30 pieces (+£1)
    expect(prices('jigsaw')).toEqual([2600, 3000, 3500]);
    expect(prices('blanket')).toEqual([6000, 7500]);
    expect(price('card')).toBe(550); // +50p
    expect(prices('storybook')).toEqual([2600, 2900]);
    expect(prices('babyBodysuit')).toEqual([2200]);
    expect(prices('calendar')).toEqual([1900, 2100]);
    expect(prices('apron')).toEqual([2500, 2900]);
    expect(prices('bauble')).toEqual([2100]);
    expect(prices('sack')).toEqual([3500]);
  });

  it('the static fallback CATALOGUE matches each product’s seeded DEFAULT variant', () => {
    for (const [key, entry] of Object.entries(CATALOGUE)) {
      const def = list.find((r) => r.productKey === key && r.isDefault);
      expect(def, key).toBeDefined();
      expect(entry.pricePence, key).toBe(def!.pricePence);
    }
  });
});
