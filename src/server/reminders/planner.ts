/**
 * The occasion-reminder planner — PURE (no I/O), so the rules that keep reminders gentle and lawful
 * are unit-tested:
 *  - CONSENT: only a recipient whose latest REMINDERS/EMAIL consent is GRANTED is ever sent anything
 *    (PECR; consent is the basis for reminders, never bundled into anything else).
 *  - WHO: a recipient only ever hears about an occasion they may SEE (decided upstream by the
 *    calendar rules, src/authz/occasions — the candidates arrive already filtered).
 *  - NO PROFILING: the only inputs are dates the family typed in or chose to celebrate.
 *  - TWO NUDGES per occasion (founder, 27 Oct): about a month before, and about two weeks before —
 *    each at most once per recipient per occasion per year.
 *  - ONE EMAIL per recipient per run: everything due goes in one gentle digest, and never more than
 *    one email every CAP_DAYS (anything due waits — its window is wider than the cap).
 */
export const NUDGES = [30, 14] as const;
/** a nudge may go out from `offset` days before down to `offset - WINDOW` days before */
export const WINDOW = 4;
export const CAP_DAYS = 2;

export interface Candidate {
  accountId: string;
  email: string;
  /** which occasion (`child:<id>`, `occ:<id>`, `fest:<family>:<festival>`, `ms:<child>:<tag>`) */
  key: string;
  year: number;
  date: string; // YYYY-MM-DD
  title: string;
  note: string | null;
}
export interface PriorSend {
  accountId: string;
  occasionKey: string;
  occasionYear: number;
  offsetDays: number;
  sentAt: Date;
}
export interface DigestLine {
  key: string;
  year: number;
  offset: number;
  title: string;
  note: string | null;
  date: string;
  inDays: number;
}
export interface Digest {
  accountId: string;
  email: string;
  lines: DigestLine[];
}

const DAY = 86_400_000;
const dayOf = (s: string) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));

export function planDigests(input: { candidates: Candidate[]; consent: Map<string, boolean>; sent: PriorSend[]; now: Date }): Digest[] {
  const today = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), input.now.getUTCDate());
  const lastSent = new Map<string, number>();
  for (const s of input.sent) lastSent.set(s.accountId, Math.max(lastSent.get(s.accountId) ?? 0, s.sentAt.getTime()));
  const done = new Set(input.sent.map((s) => `${s.accountId}|${s.occasionKey}|${s.occasionYear}|${s.offsetDays}`));

  const byAccount = new Map<string, Digest>();
  for (const c of input.candidates) {
    if (input.consent.get(c.accountId) !== true) continue; // PECR: no consent, nothing — ever
    const last = lastSent.get(c.accountId);
    if (last !== undefined && input.now.getTime() - last < CAP_DAYS * DAY) continue; // gentle: one email every few days at most
    const inDays = Math.round((dayOf(c.date) - today) / DAY);
    // the nudge whose window we're in (the 14-day one wins if somehow both are)
    const offset = [...NUDGES].reverse().find((o) => inDays <= o && inDays >= o - WINDOW);
    if (offset === undefined) continue;
    if (done.has(`${c.accountId}|${c.key}|${c.year}|${offset}`)) continue;
    const d = byAccount.get(c.accountId) ?? { accountId: c.accountId, email: c.email, lines: [] };
    if (!d.lines.some((l) => l.key === c.key && l.year === c.year)) d.lines.push({ key: c.key, year: c.year, offset, title: c.title, note: c.note, date: c.date, inDays });
    byAccount.set(c.accountId, d);
  }
  return [...byAccount.values()].map((d) => ({ ...d, lines: d.lines.sort((a, b) => a.inDays - b.inDays) }));
}
