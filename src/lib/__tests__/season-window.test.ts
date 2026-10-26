import { describe, expect, it } from 'vitest';
import { isChristmasSeason } from '@/lib/season';

const at = (iso: string) => isChristmasSeason(new Date(iso));

describe('the Christmas season: 1 Nov – 6 Jan, by the calendar in London', () => {
  it('starts at midnight UK time on 1 November', () => {
    expect(at('2026-10-31T23:59:59Z')).toBe(false);
    expect(at('2026-11-01T00:00:00Z')).toBe(true);
  });

  it('runs through Christmas and new year, to the end of 6 January', () => {
    expect(at('2026-11-20T12:00:00Z')).toBe(true);
    expect(at('2026-12-25T09:00:00Z')).toBe(true);
    expect(at('2027-01-01T00:00:00Z')).toBe(true);
    expect(at('2027-01-06T23:59:59Z')).toBe(true);
    expect(at('2027-01-07T00:00:00Z')).toBe(false);
  });

  it('is off the rest of the year', () => {
    for (const d of ['2026-02-14T12:00:00Z', '2026-07-01T12:00:00Z', '2026-10-25T12:00:00Z', '2027-03-01T12:00:00Z']) expect(at(d)).toBe(false);
  });

  it('goes by London, not the server or browser clock', () => {
    // 11pm on 31 Oct in New York is already 1 Nov in London (and vice versa on 6/7 Jan)
    expect(at('2026-10-31T23:00:00-04:00')).toBe(true);
    expect(at('2027-01-06T20:00:00-05:00')).toBe(false);
    // 1am on 1 Nov in Paris is still 31 Oct in London
    expect(at('2026-11-01T00:30:00+01:00')).toBe(false);
  });
});
