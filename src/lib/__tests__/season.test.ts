import { describe, it, expect } from 'vitest';
import {
  basketPromise,
  CHRISTMAS_FEATURED,
  CHRISTMAS_LAST_ORDER,
  christmasYear,
  deliveryPromise,
  formatShortDate,
  headlinePromise,
  isChristmasSeason,
  routeOf,
  routeOfLineKey,
  seasonalExpected,
} from '@/lib/season';

// UK wall-clock instants (GMT in Nov–Jan, so UTC == UK time).
const at = (iso: string) => new Date(iso);

describe('the season window (1 Nov → 6 Jan, UK time)', () => {
  it('is off in October and on from the first minute of 1 November', () => {
    expect(isChristmasSeason(at('2026-10-31T23:59:00Z'))).toBe(false);
    expect(isChristmasSeason(at('2026-11-01T00:00:00Z'))).toBe(true);
  });
  it('runs through Christmas and ends after 6 January', () => {
    expect(isChristmasSeason(at('2026-12-25T12:00:00Z'))).toBe(true);
    expect(isChristmasSeason(at('2027-01-06T23:00:00Z'))).toBe(true);
    expect(isChristmasSeason(at('2027-01-07T00:00:00Z'))).toBe(false);
  });
  it('is off in summer', () => {
    expect(isChristmasSeason(at('2026-07-01T12:00:00Z'))).toBe(false);
  });
  it('sells for the right Christmas in early January', () => {
    expect(christmasYear(at('2026-11-15T12:00:00Z'))).toBe(2026);
    expect(christmasYear(at('2027-01-03T12:00:00Z'))).toBe(2026);
  });
});

describe('seasonal range order', () => {
  const expected = ['framedPrint', 'mug', 'kidsTee', 'wrappingPaper'];
  it('puts the Christmas products first while the season is on, without duplicates', () => {
    const order = seasonalExpected(expected, at('2026-11-20T12:00:00Z'));
    expect(order.slice(0, CHRISTMAS_FEATURED.length)).toEqual([...CHRISTMAS_FEATURED]);
    expect(order.filter((k) => k === 'mug')).toHaveLength(1);
    expect(order).toContain('framedPrint');
  });
  it('leaves the order alone outside the season', () => {
    expect(seasonalExpected(expected, at('2026-09-01T12:00:00Z'))).toEqual(expected);
  });
});

describe('routes (which lab makes it)', () => {
  it('the ceramic bauble and the plastic ball come from different labs', () => {
    expect(routeOf('bauble', { size: 'ceramic disc' })).toBe('uk9');
    expect(routeOf('bauble', { size: 'plastic ball' })).toBe('uk5');
    expect(routeOfLineKey('bauble-plasticball')).toBe('uk5');
    expect(routeOfLineKey('bauble')).toBe('uk9');
  });
  it('variant skus resolve by their product', () => {
    expect(routeOfLineKey('wrappingPaper-3mroll-kraft')).toBe('gb2');
    expect(routeOfLineKey('cardPack-packof10')).toBe('uk7');
  });
  it('an unknown product falls back to the earliest (safest) date', () => {
    const t = CHRISTMAS_LAST_ORDER[2026]!.byRoute;
    expect(routeOf('somethingNew')).toBe('other');
    expect(Object.values(t).every((d) => d >= t.other)).toBe(true);
  });
});

describe('the "arrives by christmas" promise', () => {
  it('is silent outside the season', () => {
    expect(deliveryPromise('bauble', at('2026-10-20T12:00:00Z'))).toEqual({ state: 'off' });
  });
  it('is in time up to and including the last order date', () => {
    const p = deliveryPromise('bauble', at('2026-12-14T21:00:00Z'));
    expect(p).toMatchObject({ state: 'in-time', lastOrderDate: '2026-12-14', daysLeft: 0 });
  });
  it('is missed the day after', () => {
    expect(deliveryPromise('bauble', at('2026-12-15T08:00:00Z'))).toEqual({ state: 'missed', lastOrderDate: '2026-12-14' });
  });
  it('cards close before baubles (Guernsey)', () => {
    const now = at('2026-12-12T12:00:00Z');
    expect(deliveryPromise('card', now).state).toBe('missed');
    expect(deliveryPromise('bauble', now).state).toBe('in-time');
  });
  it('the headline strip follows the main uk9 parcel', () => {
    expect(headlinePromise(at('2026-11-10T12:00:00Z'))).toMatchObject({ state: 'in-time', lastOrderDate: '2026-12-14' });
  });
});

describe('the basket promise — one honest answer for the whole basket', () => {
  it('takes the EARLIEST last order date among the lines', () => {
    const p = basketPromise(['bauble', 'card'], at('2026-12-01T12:00:00Z'));
    expect(p).toMatchObject({ state: 'in-time', lastOrderDate: '2026-12-10' });
  });
  it('names the lines that are too late', () => {
    const p = basketPromise(['bauble', 'card', 'cardPack-packof10'], at('2026-12-12T12:00:00Z'));
    expect(p.state).toBe('missed');
    expect(p.lateLineKeys).toEqual(['card', 'cardPack-packof10']);
  });
  it('an empty basket says nothing', () => {
    expect(basketPromise([], at('2026-12-01T12:00:00Z'))).toEqual({ state: 'off' });
  });
});

describe('formatShortDate', () => {
  it('reads like the brand: lowercase weekday + month', () => {
    expect(formatShortDate('2026-12-14')).toBe('mon 14 dec');
  });
});

describe('the season PREVIEW date — development + the test site only, never the real shop', () => {
  const run = async (env: Record<string, string | undefined>) => {
    const { vi } = await import('vitest');
    vi.unstubAllEnvs();
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
    const { seasonPreviewDate, seasonClock } = await import('@/lib/season');
    const out = { date: seasonPreviewDate(), clock: seasonClock(new Date('2026-10-26T09:00:00Z')).toISOString() };
    vi.unstubAllEnvs();
    return out;
  };
  it('is ignored on the real shop (production, not the test site)', async () => {
    const r = await run({ NODE_ENV: 'production', SITE_MODE: '', SEASON_PREVIEW_DATE: '2026-11-20' });
    expect(r.date).toBeNull();
    expect(r.clock).toBe('2026-10-26T09:00:00.000Z');
  });
  it('works on the password-locked test site', async () => {
    const r = await run({ NODE_ENV: 'production', SITE_MODE: 'test', SEASON_PREVIEW_DATE: '2026-11-20' });
    expect(r.date).toBe('2026-11-20');
    expect(r.clock).toBe('2026-11-20T12:00:00.000Z');
  });
  it('ignores anything that is not a plain date', async () => {
    const r = await run({ NODE_ENV: 'production', SITE_MODE: 'test', SEASON_PREVIEW_DATE: 'tomorrow' });
    expect(r.date).toBeNull();
  });
});
