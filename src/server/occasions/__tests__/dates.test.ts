import { describe, expect, it } from 'vitest';
import { easterSunday, festivalDates, lunarDayOf, occurrencesIn } from '../dates';

describe('fixed and computed days', () => {
  it('Easter and what hangs off it', () => {
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2027)).toBe('2027-03-28');
    expect(festivalDates('mothering-sunday', 2026)).toEqual(['2026-03-15']);
    expect(festivalDates('mothering-sunday', 2027)).toEqual(['2027-03-07']);
    expect(festivalDates('shrove-tuesday', 2026)).toEqual(['2026-02-17']);
  });
  it('Father’s Day is the 3rd Sunday of June', () => {
    expect(festivalDates('fathers-day', 2026)).toEqual(['2026-06-21']);
    expect(festivalDates('fathers-day', 2027)).toEqual(['2027-06-20']);
  });
});

describe('Jewish and Islamic festivals', () => {
  it('from the Hebrew calendar', () => {
    expect(festivalDates('rosh-hashanah', 2026)).toEqual(['2026-09-12']);
    expect(festivalDates('hanukkah', 2026)).toEqual(['2026-12-05']);
    expect(festivalDates('passover', 2027)).toEqual(['2027-04-22']);
  });
  it('from the Umm al-Qura calendar (expected)', () => {
    expect(festivalDates('eid-al-fitr', 2026)).toEqual(['2026-03-20']);
    expect(festivalDates('ramadan', 2026)).toEqual(['2026-02-18']);
  });
});

describe('East Asian lunar dates', () => {
  it('Chinese New Year — including 2027, where the built-in calendar slips a day', () => {
    expect(festivalDates('lny-cn', 2026)).toEqual(['2026-02-17']);
    expect(festivalDates('lny-cn', 2027)).toEqual(['2027-02-06']);
    expect(festivalDates('lny-cn', 2028)).toEqual(['2028-01-26']);
  });
  it('Korea keeps Seoul time: Seollal can be the day after', () => {
    expect(festivalDates('seollal', 2026)).toEqual(['2026-02-17']);
    expect(festivalDates('seollal', 2027)).toEqual(['2027-02-07']);
    expect(festivalDates('seollal', 2028)).toEqual(['2028-01-27']);
  });
  it('Mid-Autumn / Chuseok and Buddha’s Birthday', () => {
    expect(festivalDates('mid-autumn-cn', 2026)).toEqual(['2026-09-25']);
    expect(festivalDates('chuseok', 2026)).toEqual(['2026-09-25']);
    expect(festivalDates('buddhas-birthday', 2026)).toEqual(['2026-05-24']);
    expect(festivalDates('buddhas-birthday', 2027)).toEqual(['2027-05-13']);
  });
});

describe('Hindu and Sikh festivals — only the checked years', () => {
  it('from the table', () => {
    expect(festivalDates('diwali', 2026)).toEqual(['2026-11-08']);
    expect(festivalDates('vaisakhi', 2028)).toEqual(['2028-04-13']);
  });
  it('a year nobody has checked yet shows nothing (never a guess)', () => {
    expect(festivalDates('diwali', 2031)).toEqual([]);
  });
});

describe('occasions in a year', () => {
  it('a Gregorian one on its day; 29 Feb on the 28th in other years', () => {
    expect(occurrencesIn(2027, { month: 12, day: 16 })).toEqual(['2027-12-16']);
    expect(occurrencesIn(2027, { month: 2, day: 29 })).toEqual(['2027-02-28']);
    expect(occurrencesIn(2028, { month: 2, day: 29 })).toEqual(['2028-02-29']);
  });
  it('a lunar birthday stays on the lunar day it happened', () => {
    // born on Chinese New Year 2026 → every Chinese New Year
    expect(lunarDayOf('2026-02-17', 'CHINESE')).toEqual({ month: 1, day: 1 });
    expect(occurrencesIn(2027, { month: 2, day: 17, lunar: 'CHINESE', origin: '2026-02-17' })).toEqual(['2027-02-06']);
    expect(occurrencesIn(2028, { month: 2, day: 17, lunar: 'KOREAN', origin: '2026-02-17' })).toEqual(['2028-01-27']);
  });
});
