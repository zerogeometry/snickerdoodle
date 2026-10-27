import { Lunar, LunarMonth, Solar } from 'lunar-javascript';
import type { FestivalKey } from '@/lib/occasions/catalogue';

/**
 * The family calendar's DATES (founder, 27 Oct) — pure, no I/O, unit-tested.
 *
 *  - fixed / computed days: New Year, Valentine's, Christmas; Easter (the Gregorian computus) and
 *    what hangs off it (Shrove Tuesday, Mothering Sunday); Father's Day (3rd Sunday of June).
 *  - Jewish + Islamic festivals from the Hebrew / Umm al-Qura calendars built into every runtime
 *    (the Islamic dates are "expected" — UK mosques follow the moon sighting, ±1 day).
 *  - CHINESE lunar dates (and Vietnamese, which follows the same new moons bar the rare year) from
 *    lunar-javascript — the built-in Chinese calendar slips a day when a new moon falls near
 *    midnight (it puts Lunar New Year 2027 on 7 Feb; it's 6 Feb).
 *  - KOREAN lunar dates from the built-in Korean (dangi) calendar on Seoul time — Korea's day can
 *    differ from China's (Seollal 2027: 7 Feb; 2028: 27 Jan).
 *  - Hindu + Sikh festivals from a checked table (their calendars aren't in any runtime): only the
 *    years every source agrees on — a year not listed simply doesn't show until it's checked.
 *  - LUNAR birthdays / occasions: kept on the lunar day of the date they happened.
 */
export type YMD = string; // YYYY-MM-DD
export type LunarCal = 'CHINESE' | 'KOREAN';

const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number): YMD => `${y}-${pad(m)}-${pad(d)}`;
const parse = (s: YMD) => s.split('-').map(Number) as [number, number, number];
const utc = (s: YMD) => {
  const [y, m, d] = parse(s);
  return Date.UTC(y, m - 1, d);
};
export function addDays(s: YMD, n: number): YMD {
  const d = new Date(utc(s) + n * 86_400_000);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
export function daysBetween(a: YMD, b: YMD): number {
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/** Easter Sunday (Anonymous Gregorian computus). */
export function easterSunday(y: number): YMD {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, month, day);
}

/** The nth `weekday` (0 = Sunday) of a month. */
function nthWeekday(y: number, m: number, weekday: number, n: number): YMD {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  return ymd(y, m, 1 + ((weekday - first + 7) % 7) + (n - 1) * 7);
}

/** Every day of a Gregorian year (noon UTC — safely inside the day in Europe and East Asia alike). */
function* daysOf(y: number): Generator<{ s: YMD; at: Date }> {
  for (let t = Date.UTC(y, 0, 1, 12); new Date(t).getUTCFullYear() === y; t += 86_400_000) {
    const at = new Date(t);
    yield { s: ymd(y, at.getUTCMonth() + 1, at.getUTCDate()), at };
  }
}

const fmt = new Map<string, Intl.DateTimeFormat>();
function parts(cal: string, at: Date, tz: string, monthStyle: 'numeric' | 'long' = 'numeric') {
  const k = `${cal}|${tz}|${monthStyle}`;
  let f = fmt.get(k);
  if (!f) fmt.set(k, (f = new Intl.DateTimeFormat(`en-u-ca-${cal}`, { year: 'numeric', month: monthStyle, day: 'numeric', timeZone: tz })));
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(at)) o[p.type] = p.value;
  return o;
}

/** The days of Gregorian year `y` that fall on (month, day) of another calendar. */
function findIn(y: number, cal: string, tz: string, month: string, day: number, monthStyle: 'numeric' | 'long' = 'numeric'): YMD[] {
  const out: YMD[] = [];
  for (const { s, at } of daysOf(y)) {
    const p = parts(cal, at, tz, monthStyle);
    if (p.month === month && Number(p.day) === day) out.push(s);
  }
  return out;
}

const chinese = (lunarYear: number, m: number, d: number): YMD => {
  const days = LunarMonth.fromYm(lunarYear, m)?.getDayCount() ?? 30;
  return Lunar.fromYmd(lunarYear, m, Math.min(d, days)).getSolar().toYmd();
};
/** Korean lunar (dangi) date → Gregorian, on Seoul time. Scans the lunar year's span. */
function korean(lunarYear: number, m: number, d: number): YMD | null {
  let last: YMD | null = null;
  for (const y of [lunarYear, lunarYear + 1]) {
    for (const { s, at } of daysOf(y)) {
      const p = parts('dangi', at, 'Asia/Seoul');
      if (Number(p.relatedYear) !== lunarYear || p.month !== String(m)) continue;
      if (Number(p.day) === d) return s;
      last = s; // the month's last day, for a 30th in a 29-day month
    }
  }
  return last;
}

/** Hindu + Sikh dates every source agrees on (Drik Panchang UK, SikhiWiki, USC, publicholidays.in). */
const ALMANAC: Partial<Record<FestivalKey, Record<number, YMD>>> = {
  diwali: { 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17' },
  'bandi-chhor': { 2026: '2026-11-08', 2027: '2027-10-29', 2028: '2028-10-17' },
  holi: { 2026: '2026-03-04', 2027: '2027-03-22', 2028: '2028-03-11' },
  'raksha-bandhan': { 2026: '2026-08-28', 2027: '2027-08-17', 2028: '2028-08-05' },
  vaisakhi: { 2026: '2026-04-14', 2027: '2027-04-14', 2028: '2028-04-13' },
};

/** The date(s) of a festival in Gregorian year `y` (usually one; an Islamic festival can fall twice). */
export function festivalDates(key: FestivalKey, y: number, opts: { buddhistCal?: LunarCal } = {}): YMD[] {
  switch (key) {
    case 'new-year': return [ymd(y, 1, 1)];
    case 'valentines': return [ymd(y, 2, 14)];
    case 'christmas': return [ymd(y, 12, 25)];
    case 'easter': return [easterSunday(y)];
    case 'shrove-tuesday': return [addDays(easterSunday(y), -47)];
    case 'mothering-sunday': return [addDays(easterSunday(y), -21)];
    case 'fathers-day': return [nthWeekday(y, 6, 0, 3)];
    case 'rosh-hashanah': return findIn(y, 'hebrew', 'UTC', 'Tishri', 1, 'long');
    case 'hanukkah': return findIn(y, 'hebrew', 'UTC', 'Kislev', 25, 'long');
    case 'passover': return findIn(y, 'hebrew', 'UTC', 'Nisan', 15, 'long');
    case 'ramadan': return findIn(y, 'islamic-umalqura', 'UTC', '9', 1);
    case 'eid-al-fitr': return findIn(y, 'islamic-umalqura', 'UTC', '10', 1);
    case 'eid-al-adha': return findIn(y, 'islamic-umalqura', 'UTC', '12', 10);
    case 'lny-cn':
    case 'tet': return [chinese(y, 1, 1)];
    case 'mid-autumn-cn':
    case 'trung-thu': return [chinese(y, 8, 15)];
    case 'seollal': return [korean(y, 1, 1)].filter((x): x is YMD => !!x);
    case 'chuseok': return [korean(y, 8, 15)].filter((x): x is YMD => !!x);
    case 'buddhas-birthday': return [opts.buddhistCal === 'KOREAN' ? korean(y, 4, 8) : chinese(y, 4, 8)].filter((x): x is YMD => !!x);
    default: {
      const d = ALMANAC[key]?.[y];
      return d ? [d] : [];
    }
  }
}

/** The lunar (month, day) a Gregorian date fell on — a leap month counts as its regular month. */
export function lunarDayOf(s: YMD, cal: LunarCal): { month: number; day: number } {
  const [y, m, d] = parse(s);
  if (cal === 'CHINESE') {
    const l = Solar.fromYmd(y, m, d).getLunar();
    return { month: Math.abs(l.getMonth()), day: l.getDay() };
  }
  const p = parts('dangi', new Date(Date.UTC(y, m - 1, d, 12)), 'Asia/Seoul');
  return { month: parseInt(p.month ?? '1', 10), day: Number(p.day) };
}

/**
 * When an occasion falls in Gregorian year `y`: a Gregorian one on its month/day (29 Feb → 28 Feb
 * in other years); a LUNAR one on the lunar day it happened (`origin` = the Gregorian date it did).
 */
export function occurrencesIn(y: number, o: { month: number; day: number; lunar?: LunarCal | null; origin?: YMD | null }): YMD[] {
  if (!o.lunar || !o.origin) {
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return [ymd(y, o.month, o.month === 2 && o.day === 29 && !leap ? 28 : o.day)];
  }
  const { month, day } = lunarDayOf(o.origin, o.lunar);
  const out: YMD[] = [];
  for (const ly of [y - 1, y]) {
    const s = o.lunar === 'CHINESE' ? chinese(ly, month, day) : korean(ly, month, day);
    if (s && parse(s)[0] === y) out.push(s);
  }
  return out;
}
