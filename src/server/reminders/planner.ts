/**
 * The occasion-reminder planner — PURE (no I/O), so the rules that keep reminders gentle
 * and lawful are unit-tested:
 *  - CONSENT: only a recipient whose latest REMINDERS/EMAIL consent is GRANTED is ever sent
 *    anything (PECR; consent is the basis for reminders, never bundled into the upload).
 *  - NO PROFILING: the only input is a birthday the parent typed in. Nothing is inferred.
 *  - ONE PER OCCASION: a child's birthday triggers at most one reminder per recipient per year.
 *  - FREQUENCY CAP: at most one reminder per recipient per CAP_DAYS, however many children.
 *  - TIMING: sent in a window ahead of the day (enough time to make + deliver something).
 */
export const REMIND_DAYS_BEFORE_MAX = 21;
export const REMIND_DAYS_BEFORE_MIN = 10;
export const CAP_DAYS = 7;

export interface PlannerChild {
  id: string;
  familyId: string;
  firstName: string;
  /** YYYY-MM-DD */
  birthday: string;
}

export interface PlannerRecipient {
  accountId: string;
  email: string;
  familyId: string;
  remindersConsent: boolean;
}

export interface PriorSend {
  accountId: string;
  childId: string;
  occasionYear: number;
  sentAt: Date;
}

export interface PlannedReminder {
  accountId: string;
  email: string;
  childId: string;
  firstName: string;
  turns: number;
  occasionYear: number;
  occasionDate: string; // YYYY-MM-DD
  inDays: number;
}

const DAY = 86_400_000;

function nextOccurrence(birthday: string, now: Date): { date: Date; year: number; turns: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (!m) return null;
  const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  let year = now.getUTCFullYear();
  let at = Date.UTC(year, bm - 1, bd);
  if (at < today) at = Date.UTC(++year, bm - 1, bd);
  return { date: new Date(at), year, turns: year - by };
}

export function planReminders(input: {
  children: PlannerChild[];
  recipients: PlannerRecipient[];
  sent: PriorSend[];
  now: Date;
}): PlannedReminder[] {
  const { now } = input;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const out: PlannedReminder[] = [];
  const lastSentAt = new Map<string, number>();
  for (const s of input.sent) lastSentAt.set(s.accountId, Math.max(lastSentAt.get(s.accountId) ?? 0, s.sentAt.getTime()));

  for (const r of input.recipients) {
    if (!r.remindersConsent) continue; // PECR: no consent, nothing — ever
    const last = lastSentAt.get(r.accountId);
    if (last !== undefined && now.getTime() - last < CAP_DAYS * DAY) continue; // frequency cap

    // Soonest qualifying birthday in this recipient's family wins this run.
    const candidates = input.children
      .filter((c) => c.familyId === r.familyId)
      .map((c) => ({ c, occ: nextOccurrence(c.birthday, now) }))
      .filter((x): x is { c: PlannerChild; occ: NonNullable<ReturnType<typeof nextOccurrence>> } => x.occ !== null && x.occ.turns > 0)
      .map((x) => ({ ...x, inDays: Math.round((x.occ.date.getTime() - today) / DAY) }))
      .filter((x) => x.inDays >= REMIND_DAYS_BEFORE_MIN && x.inDays <= REMIND_DAYS_BEFORE_MAX)
      .filter((x) => !input.sent.some((s) => s.accountId === r.accountId && s.childId === x.c.id && s.occasionYear === x.occ.year))
      .sort((a, b) => a.inDays - b.inDays);

    const pick = candidates[0];
    if (!pick) continue;
    out.push({
      accountId: r.accountId,
      email: r.email,
      childId: pick.c.id,
      firstName: pick.c.firstName,
      turns: pick.occ.turns,
      occasionYear: pick.occ.year,
      occasionDate: pick.occ.date.toISOString().slice(0, 10),
      inDays: pick.inDays,
    });
    lastSentAt.set(r.accountId, now.getTime()); // the cap also binds within one run
  }
  return out;
}
