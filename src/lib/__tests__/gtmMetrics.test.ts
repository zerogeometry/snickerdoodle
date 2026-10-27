import { describe, expect, it } from 'vitest';
import {
  channelOf,
  channelRows,
  channelTotal,
  duration,
  exVat,
  firstOrders,
  lastFullWeek,
  londonMidnight,
  parseArgs,
  parseSpendCsv,
  renderReport,
  renderTable,
  repeatRate,
  settledRepeatRate,
  trendWindows,
  weekSummary,
} from '../../../scripts/lib/gtm-metrics.mjs';

// The Monday GTM report's maths (scripts/gtm-metrics.mjs) on synthetic rows — no database.

type Order = Parameters<typeof channelOf>[0];
const at = (iso: string) => new Date(iso);
const order = (o: Partial<Order> & { customer: string; at: Date }): Order => ({
  totalPence: 3600,
  commissionPence: 0,
  code: null,
  partnerType: null,
  partnerName: null,
  isReferral: false,
  giftLink: false,
  linkOwner: null,
  joined: false,
  items: 1,
  parcelSavingPence: 0,
  familySetSavingPence: 0,
  bundle: false,
  ...o,
});
const empty = { orders: [] as Order[], giftLinks: [], joins: [], flags: [], blocked: [] as Date[] };

const [w1, w2, w3, week] = trendWindows('2026-11-16', '2026-11-22', 4);
const asOf = week!.end;

describe('dates', () => {
  it('London midnight is UTC midnight in GMT and 23:00 the day before in BST', () => {
    expect(londonMidnight('2026-11-16').toISOString()).toBe('2026-11-16T00:00:00.000Z');
    expect(londonMidnight('2026-07-01').toISOString()).toBe('2026-06-30T23:00:00.000Z');
    expect(() => londonMidnight('16/11/2026')).toThrow();
  });

  it('four back-to-back weeks ending on --to, oldest first, end exclusive', () => {
    expect([w1, w2, w3, week].map((w) => `${w!.from}..${w!.to}`)).toEqual(['2026-10-26..2026-11-01', '2026-11-02..2026-11-08', '2026-11-09..2026-11-15', '2026-11-16..2026-11-22']);
    expect(week!.end.toISOString()).toBe('2026-11-23T00:00:00.000Z');
    // the clocks go back on 25 Oct 2026, so the oldest week starts on GMT midnight too
    expect(w1!.start.toISOString()).toBe('2026-10-26T00:00:00.000Z');
  });

  it('defaults to the last full Monday–Sunday week', () => {
    expect(lastFullWeek('2026-11-23')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // a Monday
    expect(lastFullWeek('2026-11-29')).toEqual({ from: '2026-11-16', to: '2026-11-22' }); // a Sunday
    expect(parseArgs([], '2026-11-25')).toEqual({ from: '2026-11-16', to: '2026-11-22', spendPath: null });
    expect(parseArgs(['--from', '2026-11-16', '--to', '2026-11-22', '--spend', 's.csv'], '2026-12-01').spendPath).toBe('s.csv');
    expect(() => parseArgs(['--from', '2026-11-22', '--to', '2026-11-16'], '2026-12-01')).toThrow();
    expect(() => parseArgs(['--spend'], '2026-12-01')).toThrow();
  });
});

describe('channels', () => {
  const t = at('2026-11-17T10:00:00Z');
  it('a code wins; PTA class codes roll up to the school; referral codes are one channel', () => {
    expect(channelOf(order({ customer: 'a', at: t, code: 'SARAHMAKES', partnerType: 'INFLUENCER', giftLink: true })).label).toBe('creator · SARAHMAKES');
    expect(channelOf(order({ customer: 'a', at: t, code: 'STMARYS-Y2', partnerType: 'PTA', partnerName: "St Mary's PTA" })).key).toBe(
      channelOf(order({ customer: 'b', at: t, code: 'STMARYS-Y3', partnerType: 'PTA', partnerName: "St Mary's PTA" })).key,
    );
    expect(channelOf(order({ customer: 'a', at: t, code: 'DRAWIT', partnerType: 'CAMPAIGN' })).label).toBe('campaign · DRAWIT');
    expect(channelOf(order({ customer: 'a', at: t, code: 'ANNA-7QX', partnerType: 'REFERRAL', isReferral: true })).label).toBe('referral codes');
    expect(channelOf(order({ customer: 'a', at: t, code: 'WELCOME10' })).label).toBe('code · WELCOME10');
    expect(channelOf(order({ customer: 'a', at: t, giftLink: true })).label).toBe('gift link');
    expect(channelOf(order({ customer: 'a', at: t })).label).toBe('direct');
  });
});

describe('the channel table', () => {
  const orders = [
    // c1 came via the creator code before the trend, then reordered direct this week (not a first order)
    order({ customer: 'c1', at: at('2026-10-01T10:00:00Z'), code: 'SARAHMAKES', partnerType: 'INFLUENCER' }),
    order({ customer: 'c1', at: at('2026-11-18T10:00:00Z'), totalPence: 6000 }),
    // two first orders on the creator code this week, £3 commission each
    order({ customer: 'c2', at: at('2026-11-16T09:00:00Z'), code: 'SARAHMAKES', partnerType: 'INFLUENCER', totalPence: 3600, commissionPence: 150 }),
    order({ customer: 'c3', at: at('2026-11-22T23:30:00Z'), code: 'SARAHMAKES', partnerType: 'INFLUENCER', totalPence: 4800, commissionPence: 200 }),
    // a PTA class code
    order({ customer: 'c4', at: at('2026-11-19T10:00:00Z'), code: 'STMARYS-Y2', partnerType: 'PTA', partnerName: "St Mary's PTA", commissionPence: 300 }),
    // grandma buys through c2's gift link (a relative credited to the creator code)
    order({ customer: 'g1', at: at('2026-11-20T10:00:00Z'), giftLink: true, linkOwner: 'c2', joined: true }),
    // outside the week: next Monday
    order({ customer: 'c5', at: at('2026-11-23T00:00:00Z') }),
  ];
  const joins = [{ at: at('2026-11-21T10:00:00Z'), owner: 'c1' }];

  it('counts orders, first orders, ex-VAT revenue, AOV, commission and relatives per channel', () => {
    const rows = channelRows({ orders, joins }, week!, null);
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by['creator · SARAHMAKES']).toMatchObject({ orders: 2, first: 2, revenuePence: 3000 + 4000, aovPence: 3500, commissionPence: 350, relatives: 2, costPerFirstPence: null });
    expect(by['direct']).toMatchObject({ orders: 1, first: 0, revenuePence: 5000 });
    expect(by["pta · St Mary's PTA"]).toMatchObject({ orders: 1, first: 1, commissionPence: 300 });
    expect(by['gift link']).toMatchObject({ orders: 1, first: 1, relatives: 0 });
    expect(rows[0]!.label).toBe('creator · SARAHMAKES'); // most first orders first
    expect(channelTotal(rows, false)).toMatchObject({ orders: 5, first: 4, commissionPence: 650, relatives: 2, costPence: null });
  });

  it('cost per first order = (spend + commission) ÷ first orders, flagged over £15; unmatched spend still shows', () => {
    const spend = parseSpendCsv('channel,amount\nsarahmakes,£40\nst marys pta,10.00\nfacebook ads,25\n');
    const rows = channelRows({ orders, joins }, week!, spend);
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by['creator · SARAHMAKES']).toMatchObject({ spendPence: 4000, costPence: 4350, costPerFirstPence: 2175, flag: 'over £15' });
    expect(by["pta · St Mary's PTA"]).toMatchObject({ spendPence: 1000, costPerFirstPence: 1300, flag: '' });
    expect(by['facebook ads']).toMatchObject({ orders: 0, spendPence: 2500, costPerFirstPence: null, flag: 'no 1st orders' });
    expect(channelTotal(rows, true)).toMatchObject({ spendPence: 7500, costPence: 8150, costPerFirstPence: Math.round(8150 / 4) });
  });

  it('spend on a code that sold nothing this week still lands on its channel', () => {
    const codes = [
      { code: 'DRAWIT', partnerType: 'CAMPAIGN', partnerName: null },
      { code: 'OAKS-Y1', partnerType: 'PTA', partnerName: 'Oaks PTA' },
    ];
    const rows = channelRows({ orders, joins, codes }, week!, parseSpendCsv('drawit,30\noaks pta,5'));
    expect(rows.find((r) => r.label === 'campaign · DRAWIT')).toMatchObject({ orders: 0, spendPence: 3000, flag: 'no 1st orders' });
    expect(rows.find((r) => r.label === 'pta · Oaks PTA')).toMatchObject({ spendPence: 500 });
  });
});

describe('the spend file', () => {
  it('reads channel,amount with or without a header, adds repeats, and refuses junk', () => {
    expect(parseSpendCsv('﻿DRAWIT,12.50\r\n# leaflets\n"St Mary\'s PTA, Leeds","£1,000"\ndrawit,2.5\n')).toEqual([
      { channel: 'DRAWIT', pence: 1500 },
      { channel: "St Mary's PTA, Leeds", pence: 100000 },
    ]);
    expect(() => parseSpendCsv('DRAWIT,10\nSARAH,lots\n')).toThrow(/line 2/);
  });
});

describe('first orders + repeat rate', () => {
  it('a customer’s first paid order is their earliest, whatever order the rows come in', () => {
    const late = order({ customer: 'x', at: at('2026-11-20T00:00:00Z') });
    const early = order({ customer: 'x', at: at('2026-11-01T00:00:00Z') });
    const f = firstOrders([late, early]);
    expect(f.has(early)).toBe(true);
    expect(f.has(late)).toBe(false);
  });

  it('counts a 2nd order within 90 days for the window’s first-order cohort, marking it maturing', () => {
    const orders = [
      order({ customer: 'a', at: at('2026-11-17T10:00:00Z') }),
      order({ customer: 'a', at: at('2026-11-21T10:00:00Z') }), // repeat inside the week
      order({ customer: 'b', at: at('2026-11-18T10:00:00Z') }),
      order({ customer: 'b', at: at('2026-11-30T10:00:00Z') }), // after asOf — not counted yet
      order({ customer: 'c', at: at('2026-08-01T10:00:00Z') }), // not in the cohort
    ];
    expect(repeatRate(orders, week!, asOf)).toEqual({ cohort: 2, repeated: 1, rate: 0.5, maturing: true });
  });

  it('the settled rate only counts customers 90+ days in, and only 2nd orders inside 90 days', () => {
    const orders = [
      order({ customer: 'a', at: at('2026-06-01T10:00:00Z') }),
      order({ customer: 'a', at: at('2026-08-01T10:00:00Z') }), // 61 days → repeat
      order({ customer: 'b', at: at('2026-06-01T10:00:00Z') }),
      order({ customer: 'b', at: at('2026-10-01T10:00:00Z') }), // 122 days → not within 90
      order({ customer: 'c', at: at('2026-11-01T10:00:00Z') }), // too new
    ];
    expect(settledRepeatRate(orders, asOf)).toEqual({ cohort: 2, repeated: 1, rate: 0.5 });
  });
});

describe('the week summary', () => {
  const data = {
    ...empty,
    orders: [
      order({ customer: 'p1', at: at('2026-11-16T10:00:00Z'), items: 3, parcelSavingPence: 300, bundle: true }),
      order({ customer: 'p2', at: at('2026-11-17T10:00:00Z'), items: 2, familySetSavingPence: 500 }),
      order({ customer: 'g1', at: at('2026-11-18T10:00:00Z'), giftLink: true, joined: true }),
      order({ customer: 'g1', at: at('2026-11-19T10:00:00Z'), giftLink: true, joined: false }), // same buyer, counted once
      order({ customer: 'g2', at: at('2026-11-19T10:00:00Z'), giftLink: true, joined: false }),
    ],
    giftLinks: [
      { at: at('2026-11-16T08:00:00Z'), purchasedAt: at('2026-11-18T10:00:00Z') },
      { at: at('2026-11-17T08:00:00Z'), purchasedAt: at('2026-11-25T10:00:00Z') }, // bought after the week
      { at: at('2026-11-17T09:00:00Z'), purchasedAt: null },
      { at: at('2026-11-09T09:00:00Z'), purchasedAt: null }, // last week
    ],
    joins: [{ at: at('2026-11-18T11:00:00Z'), owner: 'p1' }],
    flags: [
      { at: at('2026-11-16T10:00:00Z'), decidedAt: at('2026-11-16T12:00:00Z'), viaLink: false }, // 2h
      { at: at('2026-11-17T10:00:00Z'), decidedAt: at('2026-11-17T16:00:00Z'), viaLink: false }, // 6h
      { at: at('2026-11-18T10:00:00Z'), decidedAt: at('2026-11-20T10:00:00Z'), viaLink: false }, // 48h
      { at: at('2026-11-21T10:00:00Z'), decidedAt: null, viaLink: false }, // still waiting
      { at: at('2026-11-21T11:00:00Z'), decidedAt: null, viaLink: true }, // a gift-link report
    ],
    blocked: [at('2026-11-19T00:00:00Z')],
  };

  it('gift loop: links per first order, link → purchase (as of the week end), gift buyers who joined', () => {
    const s = weekSummary(data, week!, asOf);
    expect(s.firstOrders).toBe(4);
    expect(s.giftLinksMade).toBe(3);
    expect(s.giftLinksPerFirst).toBe(0.75);
    expect(s.giftLinkBoughtRate).toBeCloseTo(1 / 3);
    expect(s.giftLinkOrders).toBe(3);
    expect(s.giftBuyers).toBe(2);
    expect(s.giftBuyersJoinedRate).toBe(0.5);
    expect(s.familyJoins).toBe(1);
  });

  it('moderation: flags this week, median + max flag → decision; gift-link reports + blocks counted apart', () => {
    const s = weekSummary(data, week!, asOf);
    expect(s.flagged).toBe(4);
    expect(s.flaggedDecided).toBe(3);
    expect(s.flagMedianMs).toBe(6 * 3_600_000);
    expect(s.flagMaxMs).toBe(48 * 3_600_000);
    expect(s.giftLinkReports).toBe(1);
    expect(s.blocked).toBe(1);
  });

  it('multi-buy: 2+ items, same-parcel + family set savings, bundles — n/a when the column is missing', () => {
    const s = weekSummary(data, week!, asOf);
    expect(s.multiItemRate).toBe(0.4);
    expect(s.parcelSavingRate).toBe(0.2);
    expect(s.familySetRate).toBe(0.2);
    expect(s.bundles).toBe(1);
    const missing = weekSummary({ ...data, orders: data.orders.map((o) => ({ ...o, parcelSavingPence: null, bundle: null })) }, week!, asOf);
    expect(missing.parcelSavingRate).toBeUndefined();
    expect(missing.bundles).toBeUndefined();
  });

  it('an empty week is dashes, not NaN', () => {
    const s = weekSummary(empty, week!, asOf);
    expect(s).toMatchObject({ orders: 0, aovPence: null, giftLinksPerFirst: null, giftLinkBoughtRate: null, flagMedianMs: null, multiItemRate: null, parcelSavingRate: null, bundles: 0 });
  });
});

describe('the printed report', () => {
  it('renders aligned tables and never prints a customer key', () => {
    const data = {
      ...empty,
      orders: [order({ customer: 'secret-hash-123', at: at('2026-11-17T10:00:00Z'), code: 'DRAWIT', partnerType: 'CAMPAIGN' })],
      waitingNow: { count: 2, oldestAt: at('2026-11-21T10:00:00Z') },
      now: at('2026-11-23T10:00:00Z'),
    };
    const text = renderReport(data, trendWindows('2026-11-16', '2026-11-22', 4), parseSpendCsv('DRAWIT,20'));
    expect(text).toContain('campaign · DRAWIT');
    expect(text).toContain('£20.00'); // cost per first order: £20 spend ÷ 1
    expect(text).toContain('over £15');
    expect(text).toContain('waiting for review right now: 2 (oldest 2d 0h)');
    expect(text).not.toContain('secret-hash-123');
    expect(text).not.toMatch(/NaN|undefined/);
  });

  it('formats', () => {
    expect(exVat(3600)).toBe(3000);
    expect(duration(45 * 60_000)).toBe('45m');
    expect(duration(3.5 * 3_600_000)).toBe('3.5h');
    expect(duration(52 * 3_600_000)).toBe('2d 4h');
    expect(renderTable(['a', 'n'], [['xx', 1], ['y', 22]])).toBe('a    n\n──  ──\nxx   1\ny   22');
  });
});
