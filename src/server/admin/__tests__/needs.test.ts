import { describe, expect, it } from 'vitest';
import { buildNeeds, LIMITS, waited, workingDaysBetween, type NeedFacts } from '../needs';
import { newUrgent, urgentEmail } from '../alerts';

// The admin app's Today list (project-office/briefs/ADMIN-APP-plan.md): its rules, on plain facts, no database.
const NOW = new Date('2026-11-18T10:00:00Z'); // a Wednesday
const h = (n: number) => new Date(NOW.getTime() - n * 3_600_000);
const d = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const empty = (): NeedFacts => ({ disputes: [], orders: [], review: { waiting: 0, oldestAt: null, reported: 0, reportedOldestAt: null }, rights: [], support: [], status: [], commission: null, handled: new Set() });
const order = (o: Partial<NeedFacts['orders'][number]>): NeedFacts['orders'][number] => ({
  ref: 'SD-1',
  status: 'PAID',
  paidAt: h(1),
  claimedAt: null,
  createdAt: h(1),
  prodigiOrderId: null,
  submitError: null,
  totalPence: 3000,
  refundedPence: 0,
  refundedAt: null,
  troubled: [],
  handOnly: false,
  ...o,
});
const keys = (f: NeedFacts) => buildNeeds(f, NOW).map((n) => n.key);

describe('the needs-you list', () => {
  it('is empty when nothing needs anyone ("all clear")', () => {
    expect(buildNeeds(empty(), NOW)).toEqual([]);
  });

  it('a paid order waits 2 hours before it counts as not sent', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-A', paidAt: h(1) }), order({ ref: 'SD-B', paidAt: h(LIMITS.notSentHours + 0.5) })];
    expect(keys(f)).toEqual(['order:SD-B:not-sent']);
  });

  // ── the Prodigi card declined (founder, 26 Nov 2026: seven quiet "insufficient funds" refusals on one order) ──
  const DECLINED = 'Prodigi createOrder failed: HTTP 500 outcome=PaymentFailed {"outcome":"PaymentFailed","message":"Your card has insufficient funds. Use a different payment method to complete this purchase."}';

  it('a declined Prodigi card is ONE urgent alert, top of the list, straight away, for every order it holds up', () => {
    const f = empty();
    f.disputes = [{ ref: 'SD-X', disputeId: 'dp_1', status: 'needs_response', reason: null, amountPence: 1000, dueBy: null, openedAt: h(3) }];
    f.orders = [
      order({ ref: 'SD-C2', paidAt: h(0.2), submitError: DECLINED, totalPence: 4500 }),
      order({ ref: 'SD-C1', paidAt: h(0.5), submitError: DECLINED, totalPence: 13866 }),
      order({ ref: 'SD-OK', paidAt: h(0.1) }), // not refused yet: not part of it
    ];
    const needs = buildNeeds(f, NOW);
    expect(needs.map((n) => n.key)).toEqual(['prodigi-card:SD-C1', 'dispute:dp_1']); // no per-order "not sent" for the held ones
    const card = needs[0]!;
    expect([card.kind, card.urgent, card.dismissable, card.href]).toEqual(['prodigi-card', true, false, 'https://dashboard.prodigi.com']);
    expect(card.title).toBe('Your Prodigi card was declined');
    expect(card.detail).toContain('2 paid orders (£183.66) can’t go to the printer');
    expect(card.detail).toContain('Waiting: SD-C1, SD-C2.');
    expect(card.detail).toContain('every 15 minutes');
    // …and it's emailed once
    expect(newUrgent(needs, new Map()).map((n) => n.key)).toContain('prodigi-card:SD-C1');
  });

  it('one held order names itself; past 2 hours it still isn’t ALSO "not sent"', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-C1', paidAt: h(LIMITS.notSentHours + 3), submitError: DECLINED, totalPence: 3000 })];
    const needs = buildNeeds(f, NOW);
    expect(needs.map((n) => n.key)).toEqual(['prodigi-card:SD-C1']);
    expect(needs[0]!.detail).toContain('SD-C1 (£30.00) can’t go to the printer');
  });

  it('other refusals are not a card problem; an order already at Prodigi isn’t either', () => {
    const f = empty();
    f.orders = [
      order({ ref: 'SD-V', paidAt: h(LIMITS.notSentHours + 1), submitError: 'Prodigi createOrder failed: HTTP 400 outcome=ValidationFailed items[0].attributes.size' }),
      order({ ref: 'SD-F', status: 'FULFILLING', prodigiOrderId: 'ord_9', claimedAt: h(1), submitError: DECLINED }),
    ];
    expect(keys(f)).toEqual(['order:SD-V:not-sent']);
  });

  it('a failed print file and a safety hold are their own items (not "not sent")', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-F', paidAt: h(5), troubled: [{ state: 'RENDER_FAILED', count: 2 }] }), order({ ref: 'SD-G', paidAt: h(5), troubled: [{ state: 'BLOCKED_GATE', count: 1 }] })];
    expect(keys(f).sort()).toEqual(['order:SD-F:render-failed', 'order:SD-G:held']);
  });

  it('5 working days at Prodigi without shipping is slow, weekends not counted', () => {
    const f = empty();
    // Wed 11 Nov → Wed 18 Nov = 5 working days; Fri 13 Nov → Wed 18 Nov = 3
    f.orders = [order({ ref: 'SD-S', status: 'FULFILLING', prodigiOrderId: 'ord_1', claimedAt: d(7) }), order({ ref: 'SD-T', status: 'FULFILLING', prodigiOrderId: 'ord_2', claimedAt: d(5) })];
    expect(keys(f)).toEqual(['order:SD-S:slow']);
    expect(workingDaysBetween(d(7), NOW)).toBe(5);
    expect(workingDaysBetween(d(5), NOW)).toBe(3);
  });

  it('a full refund on an order already at Prodigi says to cancel it there; refunded orders aren’t also "slow"', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-R', status: 'FULFILLING', prodigiOrderId: 'ord_3', claimedAt: d(9), refundedPence: 3000, refundedAt: h(1) })];
    expect(keys(f)).toEqual(['order:SD-R:refund-at-prodigi']);
  });

  it('Prodigi cancelling a paid, unrefunded order is flagged (and goes once refunded)', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-C', status: 'CANCELLED', prodigiOrderId: 'ord_4', createdAt: d(3) })];
    expect(keys(f)).toEqual(['order:SD-C:prodigi-cancelled']);
    f.orders = [order({ ref: 'SD-C', status: 'CANCELLED', prodigiOrderId: 'ord_4', createdAt: d(3), refundedPence: 3000 })];
    expect(keys(f)).toEqual([]);
  });

  it('a gift-wrap-only order is "pack by hand", never "not sent"', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-H', paidAt: h(5), handOnly: true })];
    expect(keys(f)).toEqual(['order:SD-H:by-hand']);
  });

  it('most urgent first: chargeback, report, site, orders … support; a close deadline jumps its group', () => {
    const f = empty();
    f.support = [{ id: 's1', ref: 'H-1', topic: 'order-where', receivedAt: d(2), orderRef: null }];
    f.rights = [
      { id: 'r-late', type: 'ACCESS', status: 'RECEIVED', receivedAt: d(10), dueAt: new Date(NOW.getTime() + 20 * 86_400_000) },
      { id: 'r-soon', type: 'COMPLAINT', status: 'RECEIVED', receivedAt: d(25), dueAt: new Date(NOW.getTime() + 2 * 86_400_000) },
    ];
    f.review = { waiting: 3, oldestAt: d(1), reported: 1, reportedOldestAt: h(2) };
    f.disputes = [{ ref: 'SD-D', disputeId: 'dp_1', status: 'needs_response', reason: 'fraudulent', amountPence: 2500, dueBy: new Date(NOW.getTime() + 5 * 86_400_000), openedAt: h(3) }];
    f.status = [{ key: 'watchdog', ok: false, problems: ['the disk is 91% full'], checkedAt: h(1) }];
    f.orders = [order({ ref: 'SD-N', paidAt: h(4) })];
    expect(keys(f)).toEqual(['dispute:dp_1', 'report:' + h(2).toISOString(), 'site:watchdog', 'order:SD-N:not-sent', 'rights:r-soon', 'rights:r-late', 'review:waiting', 'support:s1']);
    // the review item counts only the flagged pictures that weren't reported
    expect(buildNeeds(f, NOW).find((n) => n.key === 'review:waiting')!.title).toMatch(/^2 pictures/);
  });

  it('a closed or answered chargeback is off the list', () => {
    const f = empty();
    f.disputes = [{ ref: 'SD-D', disputeId: 'dp_2', status: 'under_review', reason: null, amountPence: 2500, dueBy: null, openedAt: h(3) }];
    expect(keys(f)).toEqual([]);
  });

  it('"done" hides only what can be dismissed; queues clear themselves', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-N', paidAt: h(4) })];
    f.support = [{ id: 's1', ref: 'H-1', topic: 'gifts', receivedAt: d(2), orderRef: null }];
    f.handled = new Set(['order:SD-N:not-sent', 'support:s1']);
    expect(keys(f)).toEqual(['support:s1']);
  });

  it('the Prodigi check and commission are listed but never urgent', () => {
    const f = empty();
    f.status = [{ key: 'prodigi-check', ok: false, problems: ['socks: size changed'], checkedAt: d(1) }];
    f.commission = { month: 'October 2026', pence: 1250, partners: 2 };
    const n = buildNeeds(f, NOW);
    expect(n.map((x) => [x.kind, x.urgent])).toEqual([
      ['prodigi', false],
      ['commission', false],
    ]);
  });

  it('carries no personal data: only refs, amounts, counts and our own words', () => {
    const f = empty();
    f.orders = [order({ ref: 'SD-N', paidAt: h(4), submitError: 'address line too long' })];
    f.support = [{ id: 's1', ref: 'H-1', topic: 'order-where', receivedAt: d(2), orderRef: 'SD-N' }];
    const text = JSON.stringify(buildNeeds(f, NOW));
    expect(text).not.toMatch(/@/);
  });

  it('many orders with the same problem become one line (a list stays readable at Christmas volume)', () => {
    const f = empty();
    f.orders = ['SD-1', 'SD-2', 'SD-3'].map((r, i) => order({ ref: r, paidAt: h(5 + i), troubled: [{ state: 'RENDER_FAILED', count: 1 }] }));
    expect(keys(f)).toHaveLength(3); // three stay separate
    f.orders.push(order({ ref: 'SD-4', paidAt: h(2.5), troubled: [{ state: 'RENDER_FAILED', count: 1 }] }));
    const n = buildNeeds(f, NOW);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ key: 'orders:render-failed:SD-4', title: '4 orders: the print file didn’t make', urgent: true, dismissable: false });
    expect(n[0]!.detail).toContain('SD-1, SD-2, SD-3, SD-4');
    // a newer order joining makes it a new problem (so its urgent email goes)
    f.orders.push(order({ ref: 'SD-5', paidAt: h(2.2), troubled: [{ state: 'RENDER_FAILED', count: 1 }] }));
    expect(keys(f)).toEqual(['orders:render-failed:SD-5']);
  });

  it('more than five waiting messages become one line to the inbox', () => {
    const f = empty();
    f.support = Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, ref: `H-${i}`, topic: 'gifts', receivedAt: d(i + 1), orderRef: null }));
    expect(buildNeeds(f, NOW).map((n) => [n.title, n.href])).toEqual([['6 help messages waiting', '/admin/inbox']]);
  });

  it('waited() reads like a person', () => {
    expect(waited(new Date(NOW.getTime() - 30_000), NOW)).toBe('just now');
    expect(waited(h(0.5), NOW)).toBe('30 min');
    expect(waited(h(5), NOW)).toBe('5h');
    expect(waited(d(3), NOW)).toBe('3 days');
  });
});

describe('urgent emails', () => {
  const f = empty();
  f.orders = [order({ ref: 'SD-N', paidAt: h(4) })];
  f.status = [{ key: 'watchdog', ok: false, problems: ['disk'], checkedAt: h(1) }];
  const needs = buildNeeds(f, NOW);

  it('go once per problem, never for what was done, and never for site problems (the watchdog emails those)', () => {
    expect(newUrgent(needs, new Map()).map((n) => n.key)).toEqual(['order:SD-N:not-sent']);
    expect(newUrgent(needs, new Map([['order:SD-N:not-sent', { emailedAt: h(1), handledAt: null }]]))).toEqual([]);
    expect(newUrgent(needs, new Map([['order:SD-N:not-sent', { emailedAt: null, handledAt: h(1) }]]))).toEqual([]);
  });

  it('link back to the admin app', () => {
    const e = urgentEmail(newUrgent(needs, new Map()), NOW, { APP_URL: 'https://snickerdoodle.co.uk' });
    expect(e.subject).toContain('SD-N');
    expect(e.text).toContain('https://snickerdoodle.co.uk/admin/orders/SD-N');
    expect(e.text).toContain('https://snickerdoodle.co.uk/admin');
  });
});
