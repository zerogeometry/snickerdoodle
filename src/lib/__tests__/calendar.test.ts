import { describe, expect, it } from 'vitest';
import { CALENDAR_PAGES, CALENDAR_PAGE_COUNT, fillCalendarPages, isCalendarKey, monthWeeks } from '@/lib/calendar';
import { calendarLine } from '@/lib/calendar-line';
import { orderItemsFor, type BasketItem } from '@/lib/store';
import { definedPriceList } from '@/server/catalogue';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { printAreaAssets } from '@/fulfillment/submit';
import { quote, type PricedCatalogue } from '@/pricing';

// The dated 2027 wall calendar (CHRISTMAS-range-and-postage.md §5, founder 2026-10-25).
const T = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 as const };
const pick = (assetId: string) => ({ assetId, transform: T });

describe('calendar pages — a cover + twelve months, gaps repeat', () => {
  it('names Prodigi’s 13 required print areas, cover first, in month order', () => {
    expect(CALENDAR_PAGE_COUNT).toBe(13);
    expect(CALENDAR_PAGES).toEqual(['cover', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']);
    expect(CALENDAR_PAGES).not.toContain('back cover'); // optional — never sent
  });

  it('ONE drawing fills all 13 pages', () => {
    const pages = fillCalendarPages([pick('a')]);
    expect(pages).toHaveLength(13);
    expect(new Set(pages.map((p) => p.assetId))).toEqual(new Set(['a']));
    expect(pages.map((p) => p.printArea)).toEqual([...CALENDAR_PAGES]);
  });

  it('one drawing on ANY page (not just the cover) still fills them all', () => {
    const slots = Array.from({ length: 13 }, (_, i) => (i === 7 ? pick('july') : null));
    expect(fillCalendarPages(slots).every((p) => p.assetId === 'july')).toBe(true);
  });

  it('keeps every chosen page where it was; the empty ones cycle through the chosen drawings in order', () => {
    const slots = [pick('c'), null, pick('feb'), null, null];
    const pages = fillCalendarPages(slots);
    expect(pages[0]!.assetId).toBe('c');
    expect(pages[2]!.assetId).toBe('feb');
    // empties (jan, mar, apr, may…) take c, feb, c, feb…
    expect([1, 3, 4, 5, 6].map((i) => pages[i]!.assetId)).toEqual(['c', 'feb', 'c', 'feb', 'c']);
  });

  it('ignores anything past 13 pages and malformed slots; refuses a calendar with no drawing', () => {
    const many = Array.from({ length: 30 }, (_, i) => pick(`d${i}`));
    expect(fillCalendarPages(many).map((p) => p.assetId)).toEqual(many.slice(0, 13).map((p) => p.assetId));
    expect(fillCalendarPages([{ assetId: '' } as never, pick('x')]).every((p) => p.assetId === 'x')).toBe(true);
    expect(() => fillCalendarPages([])).toThrow(/at least one drawing/);
    expect(() => fillCalendarPages([null, null])).toThrow(/at least one drawing/);
  });

  it('recognises the calendar key and its variant skus only', () => {
    expect(isCalendarKey('calendar')).toBe(true);
    expect(isCalendarKey('calendar-a4')).toBe(true);
    expect(isCalendarKey('cardPack')).toBe(false);
    expect(isCalendarKey('calendars')).toBe(false);
    expect(isCalendarKey(null)).toBe(false);
  });

  it('the preview’s 2027 grid is right (Monday first): Jan starts on a Friday, Feb has 28 days', () => {
    const jan = monthWeeks(2027, 0);
    expect(jan[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(jan.flat().filter(Boolean)).toHaveLength(31);
    expect(monthWeeks(2027, 1).flat().filter(Boolean)).toHaveLength(28);
    expect(monthWeeks(2027, 11).flat().filter(Boolean).at(-1)).toBe(31);
  });
});

describe('calendar catalogue + SERVER-SIDE price (founder-approved A5 £22 · A4 £24)', () => {
  const rows = definedPriceList().filter((r) => r.productKey === 'calendar');

  it('sells the DATED 2027 SKUs, at Prodigi’s exact page size, on show in the shop', () => {
    expect(rows.map((r) => [r.attributes.size, r.prodigiSku, r.pricePence, r.px])).toEqual([
      ['A5', 'CALENDAR-A5-L-DATED', 2200, { w: 2480, h: 1748 }],
      ['A4', 'CALENDAR-A4-L-DATED', 2400, { w: 3507, h: 2480 }],
    ]);
    expect(rows.every((r) => r.visibleInShop && !r.paused)).toBe(true);
    expect(definedPriceList().some((r) => r.prodigiSku?.includes('UNDATED'))).toBe(false);
  });

  it('the engine prices a calendar from the SERVER catalogue — copies multiply, the client sends no price', () => {
    const cat: PricedCatalogue = Object.fromEntries(definedPriceList().map((r) => [r.sku, { pricePence: r.pricePence, label: r.productKey }]));
    const a5 = rows.find((r) => r.attributes.size === 'A5')!.sku;
    const a4 = rows.find((r) => r.attributes.size === 'A4')!.sku;
    expect(quote([{ productKey: a5, qty: 1 }], { catalogue: cat }).subtotalPence).toBe(2200);
    expect(quote([{ productKey: a4, qty: 2 }], { catalogue: cat }).subtotalPence).toBe(4800);
    // a basket line's pricePence is display only: orderItemsFor never sends it
    const line = calendarLine({ id: 'cal-1', variant: { id: 'v', sku: a4, pricePence: 1 }, slots: [pick('a')] });
    expect(JSON.stringify(orderItemsFor([{ ...line, qty: 1 }]))).not.toMatch(/price/i);
  });
});

describe('the per-page DPI gate', () => {
  const a4 = definedPriceList().find((r) => r.prodigiSku === 'CALENDAR-A4-L-DATED')!;
  const geom = { printWidthPx: a4.px!.w, printHeightPx: a4.px!.h, bleedMm: 0, requiredDpi: 300 };

  it('a phone photo of a drawing prints fine on every page; a thumbnail is refused', () => {
    expect(assessPrintResolution(geom, { width: 3000, height: 4000 }, T, 'calendar').decision).not.toBe('BLOCK');
    expect(assessPrintResolution(geom, { width: 120, height: 90 }, T, 'calendar').decision).toBe('BLOCK');
  });
});

describe('the calendar basket line', () => {
  it('carries all 13 pages (gaps already filled) and mirrors the cover as its artwork', () => {
    const line = calendarLine({ id: 'cal-1', variant: { id: 'v', sku: 'calendar-a4', pricePence: 2400, attributes: { size: 'A4' } }, slots: [null, pick('jan'), pick('feb')] });
    expect(line.pages).toHaveLength(13);
    expect(line.artwork).toEqual(line.pages![0]);
    expect(line.pages![0]!.assetId).toBe('jan'); // the empty cover repeats the first chosen drawing
    expect(line.sub).toBe('A4 · 2027 · 2 drawings');
  });

  it('orders as qty = copies + its pages (which drawing where — never a price)', () => {
    const line = calendarLine({ id: 'cal-1', variant: { id: 'v', sku: 'calendar-a4', pricePence: 2400 }, slots: [pick('a')] });
    const [sent] = orderItemsFor([{ ...line, qty: 3 } as BasketItem]);
    expect(sent).toMatchObject({ productKey: 'calendar-a4', qty: 3 });
    expect((sent as { pages: unknown[] }).pages).toHaveLength(13);
    expect(sent).not.toHaveProperty('artwork');
  });
});

describe('printAreaAssets — the files a Prodigi item carries', () => {
  const pagesRows = CALENDAR_PAGES.map((printArea, i) => ({ printArea, printObjectId: `obj-${i}` }));

  it('a calendar sends 13 assets: a DIFFERENT file per area, with Prodigi’s area names, in page order', () => {
    const out = printAreaAssets([...CALENDAR_PAGES], [...pagesRows].reverse());
    expect(out.map((a) => a.printArea)).toEqual([...CALENDAR_PAGES]);
    expect(out.map((a) => a.printObjectId)).toEqual(pagesRows.map((r) => r.printObjectId));
  });

  it('refuses a calendar with a missing, doubled or unknown page (deny by default)', () => {
    expect(() => printAreaAssets([...CALENDAR_PAGES], pagesRows.slice(1))).toThrow(/missing: cover/);
    expect(() => printAreaAssets([...CALENDAR_PAGES], [...pagesRows, { printArea: 'march', printObjectId: 'dup' }])).toThrow(/don’t match/);
    expect(() => printAreaAssets([...CALENDAR_PAGES], [...pagesRows.slice(0, 12), { printArea: 'back cover', printObjectId: 'x' }])).toThrow(/unexpected: back cover/);
  });

  it('every other product: its ONE file fills each area of its printTo (jigsaw + lid, garment front, default)', () => {
    expect(printAreaAssets(['jigsaw', 'lid'], [{ printArea: null, printObjectId: 'f' }])).toEqual([
      { printArea: 'jigsaw', printObjectId: 'f' },
      { printArea: 'lid', printObjectId: 'f' },
    ]);
    expect(printAreaAssets(undefined, [{ printArea: null, printObjectId: 'f' }])).toEqual([{ printArea: 'default', printObjectId: 'f' }]);
    expect(() => printAreaAssets(['default'], [{ printArea: null, printObjectId: 'f' }, { printArea: null, printObjectId: 'g' }])).toThrow(/2 print files/);
  });
});
