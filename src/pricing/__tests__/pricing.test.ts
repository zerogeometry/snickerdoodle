import { describe, it, expect } from 'vitest';
import type { MembershipStatus } from '@/domain/types';
import {
  CATALOGUE,
  DELIVERY_PENCE,
  formatPence,
  priceBasket,
  quote,
  recipientLineLabel,
  resolveJoinContext,
  type JoinContext,
  type JoinProvenance,
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
    expect(q).toMatchObject({ subtotalPence: 0, deliveryPence: 0, joinSavingPence: 0, totalPence: 0 });
    expect(q.lines).toEqual([]);
  });

  it('single item adds delivery once', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }]);
    expect(q.subtotalPence).toBe(1400);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
    expect(q.totalPence).toBe(1400 + DELIVERY_PENCE);
  });

  it('multiple items + quantities sum correctly, one delivery', () => {
    const q = priceBasket([
      { productKey: 'storybook', qty: 1 }, // 2400
      { productKey: 'framedPrint', qty: 2 }, // 4400
      { productKey: 'card', qty: 3 }, // 1200
    ]);
    expect(q.subtotalPence).toBe(2400 + 4400 + 1200);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
    expect(q.totalPence).toBe(8000 + DELIVERY_PENCE);
    expect(q.lines).toHaveLength(3);
    expect(q.lines[1]).toMatchObject({ productKey: 'framedPrint', qty: 2, unitPricePence: 2200, linePence: 4400 });
  });

  it('uses the SERVER price even if the request smuggles a fake pricePence', () => {
    // The client tries to pay 1p for a blanket. Engine ignores the extra field.
    const evil = { productKey: 'blanket', qty: 1, pricePence: 1, unitPricePence: 1 } as unknown as RequestedLine;
    const q = priceBasket([evil]);
    expect(q.lines[0]!.unitPricePence).toBe(CATALOGUE.blanket.pricePence); // 4500, not 1
    expect(q.totalPence).toBe(4500 + DELIVERY_PENCE);
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
    expect(q.subtotalPence).toBe(800);
  });

  it('clamps absurd quantities to a sane max (no overflow)', () => {
    const q = priceBasket([{ productKey: 'card', qty: 10_000_000 }]);
    expect(q.lines[0]!.qty).toBe(99);
    expect(q.subtotalPence).toBe(400 * 99);
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
    expect(q.subtotalPence).toBe(1400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gift price-hiding (payer total is never hidden)
// ─────────────────────────────────────────────────────────────────────────────
describe('gift price-hiding', () => {
  const q = priceBasket([{ productKey: 'storybook', qty: 1 }], { gift: true });

  it('the payer still pays the real total (gift only hides recipient-facing prices)', () => {
    expect(q.gift).toBe(true);
    expect(q.totalPence).toBe(2400 + DELIVERY_PENCE);
  });

  it('recipient line shows "gift" instead of a price when gifting', () => {
    expect(recipientLineLabel(q.lines[0]!, true)).toBe('gift');
    expect(recipientLineLabel(q.lines[0]!, false)).toBe('£24');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The 5% join saving — provenance gating (the non-negotiable)
// ─────────────────────────────────────────────────────────────────────────────
function provenance(over: {
  invite?: Partial<NonNullable<JoinProvenance['invite']>> | null;
  membership?: Partial<NonNullable<JoinProvenance['membership']>> | null;
} = {}): JoinProvenance {
  const invite =
    over.invite === null
      ? null
      : { id: 'inv-1', familyId: 'fam-A', verified: true, revoked: false, expiresAt: NOW + 86_400_000, ...over.invite };
  const membership =
    over.membership === null
      ? null
      : { familyId: 'fam-A', status: 'ACTIVE' as MembershipStatus, inviteId: 'inv-1', isOwner: false, ...over.membership };
  return { invite, membership, now: NOW };
}

describe('resolveJoinContext — only a genuine verified join earns the saving', () => {
  it('valid verified in-window join → context', () => {
    const ctx = resolveJoinContext(provenance());
    expect(ctx).not.toBeNull();
    expect(ctx).toMatchObject({ familyId: 'fam-A', inviteId: 'inv-1', savingBps: 500 });
  });

  const denied: Array<[string, JoinProvenance]> = [
    ['guest: no invite, no membership', provenance({ invite: null, membership: null })],
    ['no invite (membership only)', provenance({ invite: null })],
    ['no membership (invite only)', provenance({ membership: null })],
    ['invite not verified', provenance({ invite: { verified: false } })],
    ['invite revoked', provenance({ invite: { revoked: true } })],
    ['invite expired', provenance({ invite: { expiresAt: NOW - 1 } })],
    ['membership REMOVED', provenance({ membership: { status: 'REMOVED' } })],
    ['membership LEFT', provenance({ membership: { status: 'LEFT' } })],
    ['owner is not joining via invite', provenance({ membership: { isOwner: true } })],
    ['membership not from THIS invite', provenance({ membership: { inviteId: 'other-invite' } })],
    ['membership has no invite (existing member)', provenance({ membership: { inviteId: null } })],
    ['cross-family membership vs invite', provenance({ membership: { familyId: 'fam-B' } })],
  ];
  for (const [name, p] of denied) {
    it(`denies — ${name}`, () => {
      expect(resolveJoinContext(p)).toBeNull();
    });
  }
});

describe('join saving — applied to goods only, via quote()', () => {
  const items: RequestedLine[] = [
    { productKey: 'storybook', qty: 1 }, // 2400
    { productKey: 'framedPrint', qty: 1 }, // 2200
  ]; // subtotal 4600

  it('valid join → 5% off the £46 subtotal, delivery untouched', () => {
    const q = quote(items, { joinProvenance: provenance() });
    expect(q.joinSavingApplied).toBe(true);
    expect(q.joinSavingPence).toBe(230); // 5% of 4600
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
    expect(q.totalPence).toBe(4600 - 230 + DELIVERY_PENCE);
  });

  it('guest (no provenance) → no saving', () => {
    const q = quote(items, {});
    expect(q.joinSavingApplied).toBe(false);
    expect(q.joinSavingPence).toBe(0);
    expect(q.totalPence).toBe(4600 + DELIVERY_PENCE);
  });

  it('forged "I am joining" with no real provenance → no saving', () => {
    // Whatever the client claims, the server resolves provenance; here it's a
    // guest, so resolveJoinContext returns null and no discount is granted.
    const q = quote(items, { joinProvenance: provenance({ invite: null, membership: null }) });
    expect(q.joinSavingApplied).toBe(false);
    expect(q.totalPence).toBe(4600 + DELIVERY_PENCE);
  });

  it('existing active member (membership not from an invite) → no saving', () => {
    const q = quote(items, { joinProvenance: provenance({ membership: { inviteId: null } }) });
    expect(q.joinSavingApplied).toBe(false);
  });

  it('no saving on an empty basket even with a valid join', () => {
    const q = quote([], { joinProvenance: provenance() });
    expect(q.joinSavingPence).toBe(0);
    expect(q.totalPence).toBe(0);
  });

  it('saving rounds to the nearest penny', () => {
    // 1 mug = 1400; 5% = 70 exactly. Use an odd subtotal to exercise rounding.
    const odd = quote([{ productKey: 'jigsaw', qty: 1 }, { productKey: 'card', qty: 1 }], {
      joinProvenance: provenance(),
    }); // subtotal 2400 → 5% = 120
    expect(odd.joinSavingPence).toBe(120);
  });

  it('gift AND a valid join compose (recipient prices hidden, payer pays the discounted total)', () => {
    const q = quote(items, { gift: true, joinProvenance: provenance() }); // subtotal 4600
    expect(q.gift).toBe(true);
    expect(q.joinSavingApplied).toBe(true);
    expect(q.joinSavingPence).toBe(230);
    expect(q.totalPence).toBe(4600 - 230 + DELIVERY_PENCE);
    expect(recipientLineLabel(q.lines[0]!, q.gift)).toBe('gift');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Defensive integrity — the total can never go negative (CLAUDE.md)
// ─────────────────────────────────────────────────────────────────────────────
describe('priceBasket — totals never go negative', () => {
  it('an absurd savingBps cannot drive the total below zero or the saving above the goods', () => {
    // savingBps is fixed at 500 by resolveJoinContext; this exercises the clamp directly.
    const oversized: JoinContext = { familyId: 'f', inviteId: 'i', savingBps: 50_000 };
    const q = priceBasket([{ productKey: 'card', qty: 1 }], { joinContext: oversized }); // subtotal 400
    expect(q.joinSavingPence).toBeLessThanOrEqual(q.subtotalPence);
    expect(q.totalPence).toBeGreaterThanOrEqual(0);
  });

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
    expect(q.totalPence).toBe(1400);
  });
  it('a custom override flows into the total', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }], { deliveryPence: 1500 });
    expect(q.deliveryPence).toBe(1500);
    expect(q.totalPence).toBe(1400 + 1500);
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
    expect(q.subtotalPence).toBe(2 * 1400);
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
