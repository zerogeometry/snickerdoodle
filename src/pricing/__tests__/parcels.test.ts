import { describe, it, expect } from 'vitest';
import { parcelGroupOf, parcelSaving, PARCEL_SAVING_PER_EXTRA_PENCE, priceBasket, type RequestedLine } from '@/pricing';

// The same-parcel saving (D24): £3 off each EXTRA item that Prodigi ships in the same parcel.
// Groups are verified against sandbox quotes (src/pricing/parcels.ts).
describe('parcelGroupOf — which parcel a line ships in', () => {
  it('ceramic ornament, sack, mug and tea towel share the uk9 homeware parcel', () => {
    for (const k of ['ceramicOrnament', 'sack', 'mug', 'teaTowel', 'mug-11oz-red']) expect(parcelGroupOf(k)).toBe('uk9-home');
  });
  it('the christmas bauble ships from uk5, not with the ceramic ornament', () => {
    expect(parcelGroupOf('christmasBauble')).toBe('uk5-ornament');
  });
  it('wrap variants (white and kraft) share one parcel', () => {
    expect(parcelGroupOf('wrappingPaper')).toBe('gb2-wrap');
    expect(parcelGroupOf('wrappingPaper-3mroll-kraft')).toBe('gb2-wrap');
  });
  it('garments, cards, frames and the AWDis jumper are never grouped', () => {
    for (const k of ['kidsTee', 'adultTee-m-white', 'kidsJumper', 'christmasJumper-m-firered', 'card', 'cardPack', 'framedPrint', 'jigsaw', 'phoneCase']) {
      expect(parcelGroupOf(k)).toBeNull();
    }
  });
});

describe('parcelSaving', () => {
  it('one item → no saving', () => {
    expect(parcelSaving([{ productKey: 'ceramicOrnament', qty: 1, linePence: 2100 }]).savingPence).toBe(0);
  });
  it('bauble + sack (one uk9 parcel) → £3 off', () => {
    const r = parcelSaving([
      { productKey: 'ceramicOrnament', qty: 1, linePence: 2100 },
      { productKey: 'sack', qty: 1, linePence: 3500 },
    ]);
    expect(r.savingPence).toBe(PARCEL_SAVING_PER_EXTRA_PENCE);
    expect(r.byGroup['uk9-home']).toEqual({ qty: 2, savingPence: 300 });
  });
  it('quantity counts: 3 baubles → £6 off (two extras)', () => {
    expect(parcelSaving([{ productKey: 'ceramicOrnament', qty: 3, linePence: 6300 }]).savingPence).toBe(600);
  });
  it('items in DIFFERENT parcels save nothing (bauble + calendar + plastic ball)', () => {
    expect(
      parcelSaving([
        { productKey: 'ceramicOrnament', qty: 1, linePence: 2100 },
        { productKey: 'calendar', qty: 1, linePence: 2400 },
        { productKey: 'christmasBauble', qty: 1, linePence: 1900 },
      ]).savingPence,
    ).toBe(0);
  });
  it('each group saves on its own', () => {
    const r = parcelSaving([
      { productKey: 'ceramicOrnament', qty: 2, linePence: 4200 },
      { productKey: 'wrappingPaper', qty: 2, linePence: 4600 },
    ]);
    expect(r.savingPence).toBe(600);
  });
  it('never more than the goods in the group', () => {
    expect(parcelSaving([{ productKey: 'socks', qty: 2, linePence: 200 }]).savingPence).toBe(200);
  });
});

describe('priceBasket — same-parcel saving is server-derived', () => {
  it('bauble + mug: total drops by £3 and the flag is set', () => {
    const q = priceBasket([
      { productKey: 'ceramicOrnament', qty: 1 },
      { productKey: 'mug', qty: 1 },
    ]);
    expect(q.subtotalPence).toBe(2100 + 1800);
    expect(q.parcelSavingPence).toBe(300);
    expect(q.parcelSavingApplied).toBe(true);
    expect(q.totalPence).toBe(2100 + 1800 - 300);
  });
  it('a single item gets no saving', () => {
    const q = priceBasket([{ productKey: 'ceramicOrnament', qty: 1 }]);
    expect(q.parcelSavingPence).toBe(0);
    expect(q.parcelSavingApplied).toBe(false);
  });
  it('a smuggled parcel-saving flag on the request is ignored', () => {
    const evil = { productKey: 'card', qty: 1, parcelSavingPence: 9999, parcelSavingApplied: true } as unknown as RequestedLine;
    const q = priceBasket([evil]);
    expect(q.parcelSavingPence).toBe(0);
    expect(q.totalPence).toBe(550);
  });
  it('stacks with the join saving but never pushes the total below zero', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 2 }], { joinContext: { familyId: 'f', inviteId: 'i', savingBps: 500 } as never });
    expect(q.joinSavingPence).toBe(180);
    expect(q.parcelSavingPence).toBe(300);
    expect(q.totalPence).toBe(3600 - 180 - 300);
  });
});
