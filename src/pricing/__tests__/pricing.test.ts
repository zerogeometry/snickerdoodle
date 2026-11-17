import { describe, it, expect } from 'vitest';
import {
  CATALOGUE,
  DELIVERY_PENCE,
  formatPence,
  priceBasket,
  quote,
  recipientLineLabel,
  type PricedLine,
  type RequestedLine,
} from '@/pricing';

const NOW = 1_750_000_000_000; // fixed clock (epoch ms) — never use Date.now() in tests

// ─────────────────────────────────────────────────────────────────────────────
// Basket maths
// ─────────────────────────────────────────────────────────────────────────────
describe('priceBasket — totals', () => {
  it('empty basket → all zero, no delivery', () => {
    const q = priceBasket([]);
    expect(q).toMatchObject({ subtotalPence: 0, deliveryPence: 0, totalPence: 0 });
    expect(q.lines).toEqual([]);
  });

  it('single item, free delivery baked in', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }]);
    expect(q.subtotalPence).toBe(1800);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE); // 0 — free delivery
    expect(q.totalPence).toBe(1800 + DELIVERY_PENCE);
  });

  it('multiple items + quantities sum correctly, free delivery', () => {
    const q = priceBasket([
      { productKey: 'storybook', qty: 1 }, // 2600
      { productKey: 'framedPrint', qty: 2 }, // 13000
      { productKey: 'card', qty: 3 }, // 1650
    ]);
    expect(q.subtotalPence).toBe(2600 + 13000 + 1650);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
    expect(q.totalPence).toBe(17250 + DELIVERY_PENCE);
    expect(q.lines).toHaveLength(3);
    expect(q.lines[1]).toMatchObject({ productKey: 'framedPrint', qty: 2, unitPricePence: 6500, linePence: 13000 });
  });

  it('uses the SERVER price even if the request smuggles a fake pricePence', () => {
    // The client tries to pay 1p for a blanket. Engine ignores the extra field.
    const evil = { productKey: 'blanket', qty: 1, pricePence: 1, unitPricePence: 1 } as unknown as RequestedLine;
    const q = priceBasket([evil]);
    expect(q.lines[0]!.unitPricePence).toBe(CATALOGUE.blanket.pricePence); // 6000, not 1
    expect(q.totalPence).toBe(CATALOGUE.blanket.pricePence + DELIVERY_PENCE);
  });
});

describe('priceBasket — quantity hardening', () => {
  const bad: Array<[string, number]> = [
    ['zero', 0],
    ['negative', -5],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['-Infinity', -Infinity],
  ];
  for (const [name, qty] of bad) {
    it(`drops a line with ${name} quantity`, () => {
      const q = priceBasket([{ productKey: 'mug', qty }]);
      expect(q.lines).toHaveLength(0);
      expect(q.subtotalPence).toBe(0);
      expect(q.deliveryPence).toBe(0); // no goods ⇒ no delivery
    });
  }

  it('floors fractional quantities', () => {
    const q = priceBasket([{ productKey: 'card', qty: 2.9 }]);
    expect(q.lines[0]!.qty).toBe(2);
    expect(q.subtotalPence).toBe(2 * 550);
  });

  it('clamps absurd quantities to a sane max (no overflow)', () => {
    const q = priceBasket([{ productKey: 'card', qty: 10_000_000 }]);
    expect(q.lines[0]!.qty).toBe(99);
    expect(q.subtotalPence).toBe(550 * 99);
    expect(Number.isSafeInteger(q.totalPence)).toBe(true);
  });
});

describe('priceBasket — unknown products', () => {
  it('rejects unknown keys, prices only what we sell', () => {
    const q = priceBasket([
      { productKey: 'mug', qty: 1 },
      { productKey: 'diamond-ring', qty: 1 },
      { productKey: '__proto__', qty: 1 },
    ]);
    expect(q.lines.map((l) => l.productKey)).toEqual(['mug']);
    expect(q.rejectedKeys).toContain('diamond-ring');
    expect(q.rejectedKeys).toContain('__proto__'); // prototype-pollution-style key is just rejected
    expect(q.subtotalPence).toBe(1800);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gift price-hiding (payer total is never hidden)
// ─────────────────────────────────────────────────────────────────────────────
describe('gift price-hiding', () => {
  const q = priceBasket([{ productKey: 'storybook', qty: 1 }], { gift: true });

  it('the payer still pays the real total (gift only hides recipient-facing prices)', () => {
    expect(q.gift).toBe(true);
    expect(q.totalPence).toBe(2600 + DELIVERY_PENCE);
  });

  it('recipient line shows "gift" instead of a price when gifting', () => {
    expect(recipientLineLabel(q.lines[0]!, true)).toBe('gift');
    expect(recipientLineLabel(q.lines[0]!, false)).toBe('£26');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The 5% join saving is RETIRED (founder, 17 Nov 2026): the free first card is the one welcome
// ─────────────────────────────────────────────────────────────────────────────
describe('no join saving — whatever the request or the caller claims', () => {
  const items: RequestedLine[] = [
    { productKey: 'storybook', qty: 1 }, // 2600
    { productKey: 'framedPrint', qty: 1 }, // 6500
  ]; // subtotal 9100

  it('a quote carries no join saving at all', () => {
    const q = quote(items, {});
    expect(q).not.toHaveProperty('joinSavingPence');
    expect(q).not.toHaveProperty('joinSavingApplied');
    expect(q.totalPence).toBe(9100 + DELIVERY_PENCE);
  });

  it('a smuggled join context or provenance changes nothing (the option no longer exists)', () => {
    const forged = {
      joinContext: { familyId: 'f', inviteId: 'i', savingBps: 500 },
      joinProvenance: { invite: { id: 'i', familyId: 'f', verified: true, revoked: false, expiresAt: NOW + 1 }, membership: { familyId: 'f', status: 'ACTIVE', inviteId: 'i', isOwner: false, savingConsumed: false }, now: NOW },
    } as unknown as Parameters<typeof quote>[1];
    expect(quote(items, forged).totalPence).toBe(9100 + DELIVERY_PENCE);
    expect(priceBasket(items, forged as unknown as Parameters<typeof priceBasket>[1]).totalPence).toBe(9100 + DELIVERY_PENCE);
  });

  it('a gift is priced in full for the payer (recipient prices hidden)', () => {
    const q = quote(items, { gift: true });
    expect(q.totalPence).toBe(9100 + DELIVERY_PENCE);
    expect(recipientLineLabel(q.lines[0]!, q.gift)).toBe('gift');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The 5% family-set saving — "dress the whole family" (3+ garments)
// ─────────────────────────────────────────────────────────────────────────────
describe('family-set saving — 3+ garments in one order', () => {
  it('kids tee + adult tee + bodysuit → 5% off the garment lines', () => {
    const q = priceBasket([
      { productKey: 'kidsTee', qty: 1 }, // 2500
      { productKey: 'adultTee', qty: 1 }, // 3200
      { productKey: 'babyBodysuit', qty: 1 }, // 2200
    ]); // garments 7900
    expect(q.familySetApplied).toBe(true);
    expect(q.familySetSavingPence).toBe(395); // 5% of 7900
    expect(q.totalPence).toBe(7900 - 395 + DELIVERY_PENCE);
  });

  it('two garments → no set saving', () => {
    const q = priceBasket([
      { productKey: 'kidsTee', qty: 1 },
      { productKey: 'adultTee', qty: 1 },
    ]);
    expect(q.familySetApplied).toBe(false);
    expect(q.familySetSavingPence).toBe(0);
  });

  it('quantity counts: 3× the same garment qualifies', () => {
    const q = priceBasket([{ productKey: 'kidsTee', qty: 3 }]); // 7500
    expect(q.familySetApplied).toBe(true);
    expect(q.familySetSavingPence).toBe(375); // 5% of 7500
  });

  it('3+ NON-garment items do not qualify', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 3 }]);
    expect(q.familySetApplied).toBe(false);
    expect(q.familySetSavingPence).toBe(0);
  });

  it('the saving applies to GARMENT lines only — other goods are not discounted', () => {
    const q = priceBasket([
      { productKey: 'kidsTee', qty: 2 }, // 5000
      { productKey: 'adultTee', qty: 1 }, // 3200 → garments 8200
      { productKey: 'framedPrint', qty: 1 }, // 6500 — not a garment
    ]);
    expect(q.familySetApplied).toBe(true);
    expect(q.familySetSavingPence).toBe(410); // 5% of 8200, NOT of 14700
    expect(q.totalPence).toBe(14700 - 410 + DELIVERY_PENCE);
  });

  it('variant skus (kidsTee-34years-blue …) classify as garments too', () => {
    // The DB catalogue keys lines by variant sku; the default variant IS the key.
    const dbCatalogue = {
      'kidsTee-34years-blue': { pricePence: 2700, label: 'kids tee' },
      'adultTee-m-white': { pricePence: 3200, label: 'adult tee' },
      'babyBodysuit-newborn-white': { pricePence: 2200, label: 'baby bodysuit' },
    };
    const q = priceBasket(
      Object.keys(dbCatalogue).map((k) => ({ productKey: k, qty: 1 })),
      { catalogue: dbCatalogue },
    ); // garments 8100
    expect(q.familySetApplied).toBe(true);
    expect(q.familySetSavingPence).toBe(405); // 5% of 8100
  });

  it('a smuggled familySetApplied flag on the request is ignored (derived, never trusted)', () => {
    const evil = { productKey: 'mug', qty: 1, familySetApplied: true, familySetSavingPence: 9999 } as unknown as RequestedLine;
    const q = priceBasket([evil]);
    expect(q.familySetApplied).toBe(false);
    expect(q.familySetSavingPence).toBe(0);
    expect(q.totalPence).toBe(1800);
  });

  it('the family set is the only saving on garments — a forged join context adds nothing', () => {
    const q = priceBasket(
      [
        { productKey: 'kidsTee', qty: 1 }, // 2500
        { productKey: 'adultTee', qty: 2 }, // 6400 → garments 8900
      ],
      { joinContext: { familyId: 'f', inviteId: 'i', savingBps: 50_000 } } as unknown as Parameters<typeof priceBasket>[1],
    ); // subtotal 8900
    expect(q.familySetApplied).toBe(true);
    expect(q.familySetSavingPence).toBe(445); // 5% of the garments
    expect(q.totalPence).toBe(8900 - 445 + DELIVERY_PENCE);
  });

  it('savings can never exceed the goods (clamped, total ≥ 0)', () => {
    const q = priceBasket([{ productKey: 'kidsTee', qty: 3 }]);
    expect(q.familySetSavingPence).toBeLessThanOrEqual(q.subtotalPence);
    expect(q.totalPence).toBeGreaterThanOrEqual(0);
  });

  it('gift + family set compose (recipient prices hidden, payer pays the discounted total)', () => {
    const q = priceBasket(
      [
        { productKey: 'kidsTee', qty: 1 },
        { productKey: 'adultTee', qty: 1 },
        { productKey: 'babyBodysuit', qty: 1 },
      ],
      { gift: true },
    );
    expect(q.gift).toBe(true);
    expect(q.familySetApplied).toBe(true);
    expect(recipientLineLabel(q.lines[0]!, q.gift)).toBe('gift');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defensive integrity — the total can never go negative (CLAUDE.md)
// ─────────────────────────────────────────────────────────────────────────────
describe('priceBasket — totals never go negative', () => {
  it('a negative delivery override cannot produce a negative total', () => {
    const q = priceBasket([{ productKey: 'card', qty: 1 }], { deliveryPence: -100_000 });
    expect(q.totalPence).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Delivery override + duplicate lines
// ─────────────────────────────────────────────────────────────────────────────
describe('priceBasket — delivery override', () => {
  it('a zero override yields free delivery on a non-empty basket', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }], { deliveryPence: 0 });
    expect(q.deliveryPence).toBe(0);
    expect(q.totalPence).toBe(1800);
  });
  it('a custom override flows into the total', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }], { deliveryPence: 1500 });
    expect(q.deliveryPence).toBe(1500);
    expect(q.totalPence).toBe(1800 + 1500);
  });
  it('the override is ignored on an empty basket (delivery stays zero)', () => {
    const q = priceBasket([], { deliveryPence: 1500 });
    expect(q.deliveryPence).toBe(0);
    expect(q.totalPence).toBe(0);
  });
});

describe('priceBasket — duplicate product keys', () => {
  it('repeated keys sum and incur delivery exactly once', () => {
    const q = priceBasket([
      { productKey: 'mug', qty: 1 },
      { productKey: 'mug', qty: 1 },
    ]);
    expect(q.lines).toHaveLength(2);
    expect(q.subtotalPence).toBe(2 * 1800);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
  });
});

describe('isCatalogueKey — inherited Object.prototype keys are rejected', () => {
  const sneaky = ['constructor', 'prototype', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'];
  it('every prototype-shaped key is rejected, prices nothing', () => {
    const q = priceBasket(sneaky.map((k) => ({ productKey: k, qty: 1 })));
    expect(q.lines).toHaveLength(0);
    expect(q.subtotalPence).toBe(0);
    for (const k of sneaky) expect(q.rejectedKeys).toContain(k);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Currency formatting
// ─────────────────────────────────────────────────────────────────────────────
describe('formatPence', () => {
  const cases: Array<[number, string]> = [
    [2400, '£24'],
    [399, '£3.99'],
    [50, '£0.50'],
    [0, '£0'],
    [-500, '-£5'], // defends against a negative input rendering "£-5"
  ];
  for (const [pence, str] of cases) {
    it(`${pence} → ${str}`, () => expect(formatPence(pence)).toBe(str));
  }

  it('recipientLineLabel formats a non-whole-pound line when not gifting', () => {
    const line: PricedLine = { productKey: 'card', label: 'card', unitPricePence: 399, qty: 1, linePence: 399 };
    expect(recipientLineLabel(line, false)).toBe('£3.99');
    expect(recipientLineLabel(line, true)).toBe('gift');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Greetings-card MULTIPACKS — one pack line, priced by the server (never the client)
// ─────────────────────────────────────────────────────────────────────────────
describe('card packs — pricing', () => {
  // The DB-shaped price list: the default variant (pack of 5) answers to the product key too.
  const cat = {
    card: { pricePence: 550, label: 'greetings card' },
    cardPack: { pricePence: 1200, label: 'card pack' },
    'cardPack-packof10': { pricePence: 2100, label: 'card pack' },
  };

  it('a pack of 5 is £12 and a pack of 10 is £21 — free delivery', () => {
    expect(priceBasket([{ productKey: 'cardPack', qty: 1 }], { catalogue: cat }).totalPence).toBe(1200 + DELIVERY_PENCE);
    expect(priceBasket([{ productKey: 'cardPack-packof10', qty: 1 }], { catalogue: cat }).totalPence).toBe(2100 + DELIVERY_PENCE);
    // the static fallback agrees on the pack of 5
    expect(priceBasket([{ productKey: 'cardPack', qty: 1 }]).totalPence).toBe(1200 + DELIVERY_PENCE);
  });

  it('a pack is cheaper than the same cards bought singly (5 × £5.50 = £27.50 vs £12)', () => {
    const singles = priceBasket([{ productKey: 'card', qty: 5 }], { catalogue: cat }).totalPence;
    const pack = priceBasket([{ productKey: 'cardPack', qty: 1 }], { catalogue: cat }).totalPence;
    expect(singles).toBe(2750);
    expect(pack).toBeLessThan(singles);
  });

  it('a pack line always prices as ONE pack, whatever qty the client sends', () => {
    const q = priceBasket([{ productKey: 'cardPack-packof10', qty: 3 }], { catalogue: cat });
    expect(q.lines[0]).toMatchObject({ qty: 1, unitPricePence: 2100, linePence: 2100 });
    expect(q.totalPence).toBe(2100);
  });

  it('two packs are two lines — each its own N cards', () => {
    const q = priceBasket([{ productKey: 'cardPack', qty: 1 }, { productKey: 'cardPack-packof10', qty: 1 }], { catalogue: cat });
    expect(q.subtotalPence).toBe(1200 + 2100);
  });

  it('a smuggled pack price is ignored — the server price stands', () => {
    const evil = { productKey: 'cardPack-packof10', qty: 1, pricePence: 1, unitPricePence: 1 } as unknown as RequestedLine;
    expect(priceBasket([evil], { catalogue: cat }).totalPence).toBe(2100);
  });

  it('a pack is charged in full — there is no join saving to claim', () => {
    const items: RequestedLine[] = [{ productKey: 'cardPack-packof10', qty: 1 }];
    expect(quote(items, { catalogue: cat })).toMatchObject({ totalPence: 2100 });
  });

  it('a pack is not a garment — no family-set saving', () => {
    expect(priceBasket([{ productKey: 'cardPack', qty: 1 }, { productKey: 'cardPack', qty: 1 }, { productKey: 'cardPack', qty: 1 }], { catalogue: cat }).familySetApplied).toBe(false);
  });
});
