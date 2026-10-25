/**
 * The Christmas season (D23): 1 November to 6 January inclusive, by the calendar in London — so
 * it starts at midnight UK time wherever the server or the browser happens to be.
 */
const LONDON = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', month: 'numeric', day: 'numeric' });

export function isChristmasSeason(now: Date): boolean {
  const parts = LONDON.formatToParts(now);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return month === 11 || month === 12 || (month === 1 && day <= 6);
}
