import { describe, expect, it } from 'vitest';
import { compareNote, funnelSteps, parseWhichWeek, percent, salesOf, weekLabel, weekPair } from '../weekMaths';

// The "this week" screen's own sums (src/server/admin/weekMaths.ts) — no database.

const at = (iso: string) => new Date(iso);

describe('weekPair — which weeks the screen compares', () => {
  it('this week so far runs Monday 00:00 London to now, against the same stretch of last week', () => {
    const now = at('2026-11-18T10:00:00Z'); // Wednesday, GMT
    const p = weekPair(now, 'this');
    expect(p.current.start).toEqual(at('2026-11-16T00:00:00Z'));
    expect(p.current.end).toEqual(now);
    expect(p.previous.start).toEqual(at('2026-11-09T00:00:00Z'));
    expect(p.previous.end).toEqual(at('2026-11-11T10:00:00Z'));
    expect(p.asOf).toEqual(now);
    expect([p.current.from, p.current.to, p.previous.from, p.previous.to]).toEqual(['2026-11-16', '2026-11-18', '2026-11-09', '2026-11-11']);
    expect(p.vsLabel).toBe('this time last week');
  });

  it('last week is the whole Monday–Sunday week, against the whole week before; counted up to its end', () => {
    const p = weekPair(at('2026-11-18T10:00:00Z'), 'last');
    expect(p.current.start).toEqual(at('2026-11-09T00:00:00Z'));
    expect(p.current.end).toEqual(at('2026-11-16T00:00:00Z'));
    expect(p.previous.start).toEqual(at('2026-11-02T00:00:00Z'));
    expect(p.previous.end).toEqual(at('2026-11-09T00:00:00Z'));
    expect(p.asOf).toEqual(at('2026-11-16T00:00:00Z'));
    expect([p.current.from, p.current.to]).toEqual(['2026-11-09', '2026-11-15']);
    expect(p.vsLabel).toBe('the week before');
  });

  it('a week that crosses the clocks going back starts at midnight London time (BST), and compares to the same wall-clock time', () => {
    const now = at('2026-10-27T09:00:00Z'); // Tuesday 09:00 GMT; clocks went back Sunday 25 Oct
    const p = weekPair(now, 'this');
    expect(p.current.start).toEqual(at('2026-10-26T00:00:00Z'));
    expect(p.previous.start).toEqual(at('2026-10-18T23:00:00Z')); // Monday 19 Oct 00:00 BST
    expect(p.previous.end).toEqual(at('2026-10-20T08:00:00Z')); // Tuesday 09:00 BST
    const last = weekPair(now, 'last');
    expect([last.current.from, last.current.to]).toEqual(['2026-10-19', '2026-10-25']);
    expect(last.current.end).toEqual(at('2026-10-26T00:00:00Z'));
  });

  it('just after midnight on a summer Monday is already the new week; late on Sunday is still the old one', () => {
    expect(weekPair(at('2026-06-01T00:30:00Z'), 'this').current.start).toEqual(at('2026-05-31T23:00:00Z'));
    expect(weekPair(at('2026-11-22T23:30:00Z'), 'this').current.start).toEqual(at('2026-11-16T00:00:00Z'));
  });

  it('only "last" switches weeks', () => {
    expect(parseWhichWeek('last')).toBe('last');
    expect(parseWhichWeek(undefined)).toBe('this');
    expect(parseWhichWeek('LAST')).toBe('this');
    expect(parseWhichWeek(['last', 'this'])).toBe('this');
  });
});

describe('salesOf — paid orders and takings', () => {
  const w = { start: at('2026-11-16T00:00:00Z'), end: at('2026-11-23T00:00:00Z') };
  it('adds up the window only, with and without VAT', () => {
    const s = salesOf(
      [
        { at: at('2026-11-15T23:59:59Z'), totalPence: 9999 }, // the Sunday before
        { at: at('2026-11-16T00:00:00Z'), totalPence: 3600 },
        { at: at('2026-11-20T12:00:00Z'), totalPence: 4801 },
        { at: at('2026-11-23T00:00:00Z'), totalPence: 9999 }, // the next Monday
      ],
      w,
    );
    expect(s.orders).toBe(2);
    expect(s.takingsPence).toBe(8401);
    expect(s.takingsExVatPence).toBe(3000 + 4001); // each order's VAT taken off, rounded per order (as the Monday report)
    expect(s.averagePence).toBe(4201);
  });
  it('no orders: zero takings and no average', () => {
    expect(salesOf([], w)).toEqual({ orders: 0, takingsPence: 0, takingsExVatPence: 0, averagePence: null });
  });
});

describe('funnelSteps — where families drop off', () => {
  it('each step as a share of the one before, and its bar against the biggest step', () => {
    const s = funnelSteps({ uploads: 40, designs: 20, checkouts: 10, paid: 6 });
    expect(s.map((x) => x.key)).toEqual(['uploads', 'designs', 'checkouts', 'paid']);
    expect(s.map((x) => x.ofPrevious)).toEqual([null, 0.5, 0.5, 0.6]);
    expect(s.map((x) => x.barShare)).toEqual([1, 0.5, 0.25, 0.15]);
  });
  it('a step after an empty one has no share; an empty week has empty bars', () => {
    const s = funnelSteps({ uploads: 0, designs: 3, checkouts: 0, paid: 0 });
    expect(s.map((x) => x.ofPrevious)).toEqual([null, null, 0, null]);
    expect(funnelSteps({ uploads: 0, designs: 0, checkouts: 0, paid: 0 }).every((x) => x.barShare === 0)).toBe(true);
  });
  it('a step can be bigger than the one before (a design from an older picture) — shown as it is, not capped', () => {
    const s = funnelSteps({ uploads: 2, designs: 5, checkouts: 1, paid: 1 });
    expect(s[1]!.ofPrevious).toBe(2.5);
    expect(s[1]!.barShare).toBe(1);
    expect(percent(s[1]!.ofPrevious)).toBe('250%');
  });
});

describe('the words', () => {
  it('compareNote says up, down or the same, in plain words', () => {
    expect(compareNote(12, 8, 'this time last week')).toBe('up from 8 this time last week');
    expect(compareNote(3, 8, 'the week before')).toBe('down from 8 the week before');
    expect(compareNote(5, 5, 'the week before')).toBe('same as the week before');
    expect(compareNote(4200, 3600, 'the week before', (n) => `£${n / 100}`)).toBe('up from £36 the week before');
    expect(compareNote(4200, null, 'the week before')).toBe('none the week before');
    expect(compareNote(null, null, 'the week before')).toBe('none the week before either');
    expect(compareNote(null, 3600, 'the week before', (n) => `£${n / 100}`)).toBe('£36 the week before');
  });
  it('weekLabel and percent', () => {
    expect(weekLabel(weekPair(at('2026-11-18T10:00:00Z'), 'last').current)).toBe('mon 9 nov – sun 15 nov');
    expect(weekLabel(weekPair(at('2026-11-16T10:00:00Z'), 'this').current)).toBe('mon 16 nov');
    expect(percent(0.126)).toBe('13%');
    expect(percent(null)).toBe('—');
    expect(percent(undefined)).toBe('—');
  });
});
