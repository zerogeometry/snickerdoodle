import { describe, expect, it } from 'vitest';
import { birthdayView } from '../birthdayView';

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);

describe('the home page birthday: day, month and age, never the year (A-59)', () => {
  it('a birthday still to come this year', () => {
    expect(birthdayView('2020-03-14', at('2026-02-01'))).toEqual({ month: 3, day: 14, turns: 6 });
  });
  it('a birthday already gone this year comes round next year', () => {
    expect(birthdayView('2020-03-14', at('2026-11-10'))).toEqual({ month: 3, day: 14, turns: 7 });
  });
  it('today is the birthday', () => {
    expect(birthdayView('2019-11-10', at('2026-11-10'))).toEqual({ month: 11, day: 10, turns: 7 });
  });
  it('nothing given, nothing shown', () => {
    expect(birthdayView(null, at('2026-11-10'))).toBeNull();
    expect(birthdayView('', at('2026-11-10'))).toBeNull();
    expect(birthdayView('not a date', at('2026-11-10'))).toBeNull();
  });
  it('carries no year at all', () => {
    const v = birthdayView('2021-07-30', at('2026-11-10'));
    expect(JSON.stringify(v)).not.toMatch(/20\d\d/);
    expect(Object.keys(v!).sort()).toEqual(['day', 'month', 'turns']);
  });
});
