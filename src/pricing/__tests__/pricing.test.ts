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

  it('single item, free delivery baked in', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }]);
    expect(q.subtotalPence).toBe(1595);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE); // 0 — free delivery
    expect(q.totalPence).toBe(1595 + DELIVERY_PENCE);
  });

  it('multiple items + quantities sum correctly, free delivery', () => {
    const q = priceBasket([
      { productKey: 'storybook', qty: 1 }, // 2350
      { productKey: 'framedPrint', qty: 2 }, // 13390
      { productKey: 'card', qty: 3 }, // 1485
    ]);
    expect(q.subtotalPence).toBe(2350 + 13390 + 1485);
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
    expect(q.totalPence).toBe(17225 + DELIVERY_PENCE);
    expect(q.lines).toHaveLength(3);
    expect(q.lines[1]).toMatchObject({ productKey: 'framedPrint', qty: 2, unitPricePence: 6695, linePence: 13390 });
  });

  it('uses the SERVER price even if the request smuggles a fake pricePence', () => {
    // The client tries to pay 1p for a blanket. Engine ignores the extra field.
    const evil = { productKey: 'blanket', qty: 1, pricePence: 1, unitPricePence: 1 } as unknown as RequestedLine;
    const q = priceBasket([evil]);
    expect(q.lines[0]!.unitPricePence).toBe(CATALOGUE.blanket.pricePence); // 5795, not 1
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
    expect(q.subtotalPence).toBe(2 * 495);
  });

  it('clamps absurd quantities to a sane max (no overflow)', () => {
    const q = priceBasket([{ productKey: 'card', qty: 10_000_000 }]);
    expect(q.lines[0]!.qty).toBe(99);
    expect(q.subtotalPence).toBe(495 * 99);
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
    expect(q.subtotalPence).toBe(1595);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gift price-hiding (payer total is never hidden)
// ─────────────────────────────────────────────────────────────────────────────
describe('gift price-hiding', () => {
  const q = priceBasket([{ productKey: 'storybook', qty: 1 }], { gift: true });

  it('the payer still pays the real total (gift only hides recipient-facing prices)', () => {
    expect(q.gift).toBe(true);
    expect(q.totalPence).toBe(2350 + DELIVERY_PENCE);
  });

  it('recipient line shows "gift" instead of a price when gifting', () => {
    expect(recipientLineLabel(q.lines[0]!, true)).toBe('gift');
    expect(recipientLineLabel(q.lines[0]!, false)).toBe('£23.50');
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
      : { familyId: 'fam-A', status: 'ACTIVE' as MembershipStatus, inviteId: 'inv-1', isOwner: false, savingConsumed: false, ...over.membership };
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
    ['join saving already consumed (one-time)', provenance({ membership: { savingConsumed: true } })],
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
    { productKey: 'storybook', qty: 1 }, // 2350
    { productKey: 'framedPrint', qty: 1 }, // 6695
  ]; // subtotal 9045

  it('valid join → 5% off the subtotal, delivery untouched', () => {
    const q = quote(items, { joinProvenance: provenance() });
    expect(q.joinSavingApplied).toBe(true);
    expect(q.joinSavingPence).toBe(452); // Math.round(5% of 9045) = 452
    expect(q.deliveryPence).toBe(DELIVERY_PENCE);
    expect(q.totalPence).toBe(9045 - 452 + DELIVERY_PENCE);
  });

  it('guest (no provenance) → no saving', () => {
    const q = quote(items, {});
    expect(q.joinSavingApplied).toBe(false);
    expect(q.joinSavingPence).toBe(0);
    expect(q.totalPence).toBe(9045 + DELIVERY_PENCE);
  });

  it('forged "I am joining" with no real provenance → no saving', () => {
    // Whatever the client claims, the server resolves provenance; here it's a
    // guest, so resolveJoinContext returns null and no discount is granted.
    const q = quote(items, { joinProvenance: provenance({ invite: null, membership: null }) });
    expect(q.joinSavingApplied).toBe(false);
    expect(q.totalPence).toBe(9045 + DELIVERY_PENCE);
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
    // Use an odd subtotal to exercise rounding: jigsaw 2795 + card 495 = 3290.
    const odd = quote([{ productKey: 'jigsaw', qty: 1 }, { productKey: 'card', qty: 1 }], {
      joinProvenance: provenance(),
    }); // subtotal 3290 → 5% = 164.5 → Math.round → 165
    expect(odd.joinSavingPence).toBe(165);
  });

  it('gift AND a valid join compose (recipient prices hidden, payer pays the discounted total)', () => {
    const q = quote(items, { gift: true, joinProvenance: provenance() }); // subtotal 9045
    expect(q.gift).toBe(true);
    expect(q.joinSavingApplied).toBe(true);
    expect(q.joinSavingPence).toBe(452);
    expect(q.totalPence).toBe(9045 - 452 + DELIVERY_PENCE);
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
    expect(q.totalPence).toBe(1595);
  });
  it('a custom override flows into the total', () => {
    const q = priceBasket([{ productKey: 'mug', qty: 1 }], { deliveryPence: 1500 });
    expect(q.deliveryPence).toBe(1500);
    expect(q.totalPence).toBe(1595 + 1500);
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
    expect(q.subtotalPence).toBe(2 * 1595);
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
