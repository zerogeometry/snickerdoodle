/**
 * A child's birthday as the keepsake home shows it: the day, the month and the age they turn next.
 * Never the year (Children's Code standard 8, A-59): the home page's data goes to the browser, and a
 * relative who shares the family calendar should see "turns 6 on 14 March", not a date of birth.
 * Pure: pass `now` in, so it's tested against fixed dates.
 */
export type BirthdayView = { month: number; day: number; turns: number };

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})/;

export function birthdayView(iso: string | null | undefined, now: Date): BirthdayView | null {
  const m = iso ? ISO_DAY.exec(iso) : null;
  if (!m) return null;
  const [y, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  // the next time it comes round (today counts), and how old they'll be then
  let year = now.getUTCFullYear();
  if (Date.UTC(year, month - 1, day) < today) year += 1;
  return { month, day, turns: year - y };
}
