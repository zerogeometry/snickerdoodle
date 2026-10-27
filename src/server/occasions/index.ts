import 'server-only';
import { and, eq, inArray } from 'drizzle-orm';
import { canAddOccasion, canChangeOccasion, canSeeFamilyCalendar, canSetCelebrate, type CalendarMembership } from '@/authz';
import { accounts, auditRecords, children, families, memberships, occasions } from '@/db/schema';
import type { Circle } from '@/domain/types';
import { CHRISTMAS_LAST_ORDER } from '@/lib/season';
import { cleanCelebrate, EXPECTED_FESTIVALS, FESTIVAL_GROUPS, FESTIVAL_NAMES, type FestivalKey } from '@/lib/occasions/catalogue';
import type { DbHandle } from '../db';
import { containsAbusiveText } from '../textSafety';
import { addDays, daysBetween, festivalDates, occurrencesIn, type LunarCal, type YMD } from './dates';

/**
 * The family calendar (founder, 27 Oct). One family's dated events — its little ones' birthdays (and
 * baby milestones when the family marks them), its own occasions, the festivals it celebrates — with
 * WHO may see each (`audience`), so the page and the reminders run the same rules (src/authz/occasions).
 */
export type EventKind = 'birthday' | 'anniversary' | 'milestone' | 'festival' | 'other' | 'shop';
export interface CalendarEvent {
  /** which occasion (stable across years — the reminders' key) */
  key: string;
  date: YMD;
  title: string;
  /** a short second line ("turns 6", "40th anniversary", "expected") */
  note: string | null;
  kind: EventKind;
  familyId: string;
  familyName: string;
  /** the viewer's own (home) family */
  own: boolean;
  /** worth a "make a gift" */
  giftable: boolean;
  /** the date can move by a day (moon sighting / almanac) */
  expected: boolean;
  lunar: boolean;
  /** the occasion row, when it is one (for editing) */
  occasionId: string | null;
}
type Audience = 'calendar' | Circle; // 'calendar' = everyone who sees the calendar
interface FamilyEvent extends Omit<CalendarEvent, 'own'> {
  audience: Audience;
}

const ORD = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`;
const year = (s: YMD) => Number(s.slice(0, 4));
const years = (from: YMD, to: YMD) => Array.from({ length: year(to) - year(from) + 1 }, (_, i) => year(from) + i);
const within = (s: YMD, from: YMD, to: YMD) => s >= from && s <= to;

type FamilyRow = { id: string; displayName: string; celebrate: unknown };

/** One family's events between two dates (inclusive). */
export async function familyEvents(db: DbHandle, fam: FamilyRow, from: YMD, to: YMD, opts: { festivals: boolean; shop?: boolean } = { festivals: true }): Promise<FamilyEvent[]> {
  const out: FamilyEvent[] = [];
  const celebrate = new Set(cleanCelebrate(fam.celebrate));
  const base = { familyId: fam.id, familyName: fam.displayName, expected: false, lunar: false, occasionId: null };

  // the little ones' birthdays (+ baby milestones)
  const kids = await db.select().from(children).where(eq(children.familyId, fam.id));
  for (const k of kids) {
    if (!k.birthday) continue;
    const born = String(k.birthday).slice(0, 10);
    const [by, bm, bd] = born.split('-').map(Number) as [number, number, number];
    for (const y of years(from, to)) {
      for (const d of occurrencesIn(y, { month: bm, day: bd, lunar: k.birthdayLunar as LunarCal | null, origin: born })) {
        const turns = y - by;
        if (turns < 1 || !within(d, from, to)) continue;
        const dol = turns === 1 && celebrate.has('milestones');
        out.push({ ...base, key: `child:${k.id}`, date: d, title: `${k.firstName} turns ${turns}`, note: dol ? 'first birthday (dol)' : k.birthdayLunar ? 'lunar birthday' : null, kind: 'birthday', giftable: true, lunar: !!k.birthdayLunar, audience: 'calendar' });
      }
    }
    if (celebrate.has('milestones')) {
      for (const [days, label, tag] of [[30, 'full month', 'month'], [99, '100 days', '100d']] as const) {
        const d = addDays(born, days);
        if (within(d, from, to)) out.push({ ...base, key: `ms:${k.id}:${tag}`, date: d, title: `${k.firstName}’s ${label}`, note: tag === '100d' ? 'baek-il' : 'manyue', kind: 'milestone', giftable: true, audience: 'calendar' });
      }
    }
  }

  // the family's own occasions
  const occs = await db.select().from(occasions).where(eq(occasions.familyId, fam.id));
  for (const o of occs) {
    const origin = o.year ? `${o.year}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}` : null;
    for (const y of years(from, to)) {
      for (const d of occurrencesIn(y, { month: o.month, day: o.day, lunar: o.lunar as LunarCal | null, origin })) {
        if (!within(d, from, to)) continue;
        const n = o.year ? y - o.year : null;
        const note = o.kind === 'BIRTHDAY' && n && n > 0 ? `turns ${n}` : o.kind === 'ANNIVERSARY' && n && n > 0 ? `${ORD(n)} anniversary` : null;
        out.push({
          ...base,
          key: `occ:${o.id}`,
          date: d,
          title: o.title,
          note: o.lunar ? [note, 'lunar'].filter(Boolean).join(' · ') : note,
          kind: o.kind === 'BIRTHDAY' ? 'birthday' : o.kind === 'ANNIVERSARY' ? 'anniversary' : o.kind === 'MILESTONE' ? 'milestone' : 'other',
          giftable: true,
          lunar: !!o.lunar,
          occasionId: o.id,
          audience: o.shareCircle,
        });
      }
    }
  }

  // the festivals the family celebrates
  if (opts.festivals) {
    const buddhistCal: LunarCal = celebrate.has('east-asian-kr') && !celebrate.has('east-asian-cn') ? 'KOREAN' : 'CHINESE';
    const keys = new Set<FestivalKey>(FESTIVAL_GROUPS.filter((g) => celebrate.has(g.id)).flatMap((g) => g.festivals));
    for (const f of keys) {
      for (const y of years(from, to)) {
        for (const d of festivalDates(f, y, { buddhistCal })) {
          if (!within(d, from, to)) continue;
          const expected = EXPECTED_FESTIVALS.has(f);
          out.push({ ...base, key: `fest:${fam.id}:${f}`, date: d, title: FESTIVAL_NAMES[f], note: expected ? 'expected date' : null, kind: 'festival', giftable: true, expected, audience: 'calendar' });
        }
      }
    }
    // the shop's own date: the last day to order for Christmas (from the season's cut-offs)
    if (opts.shop && celebrate.has('christmas')) {
      for (const y of years(from, to)) {
        const cut = CHRISTMAS_LAST_ORDER[y];
        if (!cut) continue;
        const last = Object.values(cut.byRoute).sort().at(-1)!;
        if (within(last, from, to)) out.push({ ...base, key: `shop:christmas:${y}`, date: last, title: 'last day to order for Christmas', note: cut.provisional ? 'provisional' : null, kind: 'shop', giftable: true, audience: 'calendar' });
      }
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** May this member see this event? (the calendar's own rules — src/authz/occasions) */
export function canSeeEvent(e: { audience: Audience; familyId: string }, m: CalendarMembership | null | undefined): boolean {
  if (!canSeeFamilyCalendar(m, e.familyId)) return false;
  if (e.audience === 'calendar' || m!.isOwner) return true;
  return e.audience === 'EXTENDED' || m!.circle === 'FAMILY';
}

/** The viewer's ACTIVE memberships, as the calendar rules need them, with their families. */
export async function calendarMemberships(db: DbHandle, accountId: string): Promise<{ m: CalendarMembership; fam: FamilyRow }[]> {
  const rows = await db
    .select({ m: memberships, f: families })
    .from(memberships)
    .innerJoin(families, eq(families.id, memberships.familyId))
    .where(and(eq(memberships.accountId, accountId), eq(memberships.status, 'ACTIVE')));
  return rows.map(({ m, f }) => ({
    m: { familyId: m.familyId, accountId: m.accountId, circle: m.circle, accessLevel: m.accessLevel, status: m.status, isOwner: m.isOwner, seesOccasions: m.seesOccasions },
    fam: { id: f.id, displayName: f.displayName, celebrate: f.celebrate },
  }));
}

/**
 * The viewer's calendar: their home family's dates and festivals, plus the occasions OTHER families
 * have shared with them (only where that family's owner shared its calendar with them, and only at
 * the circle each occasion is shared with). Other families' festivals aren't repeated.
 */
export async function loadCalendar(db: DbHandle, accountId: string, homeFamilyId: string, from: YMD, to: YMD): Promise<CalendarEvent[]> {
  const out: CalendarEvent[] = [];
  for (const { m, fam } of await calendarMemberships(db, accountId)) {
    if (!canSeeFamilyCalendar(m, fam.id)) continue;
    const own = fam.id === homeFamilyId;
    for (const e of await familyEvents(db, fam, from, to, { festivals: own, shop: own })) {
      if (!canSeeEvent(e, m)) continue;
      const { audience: _a, ...ev } = e;
      out.push({ ...ev, own });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(b.own) - Number(a.own));
}

// ── occasions: add / change / remove ─────────────────────────────────────────────────────────
export interface OccasionInput {
  title: string;
  kind: 'BIRTHDAY' | 'ANNIVERSARY' | 'MILESTONE' | 'OTHER';
  /** YYYY-MM-DD, or --MM-DD when the year isn't known */
  date: string;
  lunar?: LunarCal | null;
  childId?: string | null;
  memberAccountId?: string | null;
  shareCircle?: Circle;
}
export type OccasionResult = { ok: true; id: string } | { ok: false; reason: 'not-allowed' | 'invalid' | 'words' | 'date' | 'lunar-needs-year' };

async function membershipIn(db: DbHandle, accountId: string, familyId: string): Promise<CalendarMembership | null> {
  const [m] = await db.select().from(memberships).where(and(eq(memberships.accountId, accountId), eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE')));
  return m ? { familyId: m.familyId, accountId: m.accountId, circle: m.circle, accessLevel: m.accessLevel, status: m.status, isOwner: m.isOwner, seesOccasions: m.seesOccasions } : null;
}

async function clean(db: DbHandle, familyId: string, input: OccasionInput) {
  const title = String(input.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!title) return { error: 'invalid' as const };
  if (containsAbusiveText(title)) return { error: 'words' as const };
  if (!['BIRTHDAY', 'ANNIVERSARY', 'MILESTONE', 'OTHER'].includes(input.kind)) return { error: 'invalid' as const };
  // YYYY-MM-DD, or --MM-DD when the year isn't known
  const m = /^(?:(\d{4})|-)-(\d{2})-(\d{2})$/.exec(String(input.date ?? ''));
  if (!m) return { error: 'date' as const };
  const y = m[1] ? Number(m[1]) : null;
  const mo = Number(m[2]), d = Number(m[3]);
  const probe = new Date(Date.UTC(y ?? 2000, mo - 1, d)); // 2000: a leap year, so 29 Feb is fine yearless
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d || (y !== null && (y < 1900 || y > new Date().getUTCFullYear() + 1))) return { error: 'date' as const };
  const lunar = input.lunar === 'CHINESE' || input.lunar === 'KOREAN' ? input.lunar : null;
  if (lunar && y === null) return { error: 'lunar-needs-year' as const };
  // who it's for must be IN this family
  let childId: string | null = null;
  if (input.childId) {
    const [c] = await db.select({ id: children.id }).from(children).where(and(eq(children.id, input.childId), eq(children.familyId, familyId)));
    if (!c) return { error: 'invalid' as const };
    childId = c.id;
  }
  let memberAccountId: string | null = null;
  if (input.memberAccountId) {
    const [mm] = await db.select({ a: memberships.accountId }).from(memberships).where(and(eq(memberships.accountId, input.memberAccountId), eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE')));
    if (!mm) return { error: 'invalid' as const };
    memberAccountId = mm.a;
  }
  const shareCircle: Circle = input.shareCircle === 'EXTENDED' ? 'EXTENDED' : 'FAMILY'; // FAMILY by default (founder, 27 Oct)
  return { row: { title, kind: input.kind, month: mo, day: d, year: y, lunar, childId, memberAccountId, shareCircle } };
}

export async function addOccasion(db: DbHandle, accountId: string, familyId: string, input: OccasionInput): Promise<OccasionResult> {
  if (!canAddOccasion(await membershipIn(db, accountId, familyId), familyId)) return { ok: false, reason: 'not-allowed' };
  const c = await clean(db, familyId, input);
  if ('error' in c) return { ok: false, reason: c.error! };
  const [row] = await db.insert(occasions).values({ ...c.row, familyId, createdByAccountId: accountId }).returning({ id: occasions.id });
  return { ok: true, id: row!.id };
}

export async function updateOccasion(db: DbHandle, accountId: string, occasionId: string, input: OccasionInput): Promise<OccasionResult> {
  const [o] = await db.select().from(occasions).where(eq(occasions.id, occasionId));
  if (!o || !canChangeOccasion(o, await membershipIn(db, accountId, o.familyId))) return { ok: false, reason: 'not-allowed' };
  const c = await clean(db, o.familyId, input);
  if ('error' in c) return { ok: false, reason: c.error! };
  await db.update(occasions).set(c.row).where(eq(occasions.id, occasionId));
  return { ok: true, id: occasionId };
}

export async function deleteOccasion(db: DbHandle, accountId: string, occasionId: string): Promise<boolean> {
  const [o] = await db.select().from(occasions).where(eq(occasions.id, occasionId));
  if (!o || !canChangeOccasion(o, await membershipIn(db, accountId, o.familyId))) return false;
  await db.delete(occasions).where(eq(occasions.id, occasionId));
  return true;
}

/** The family's own occasions the viewer may see — for the "add / edit an occasion" sheet. */
export async function occasionsFor(db: DbHandle, accountId: string, familyId: string) {
  const m = await membershipIn(db, accountId, familyId);
  if (!canSeeFamilyCalendar(m, familyId)) return [];
  const rows = await db.select().from(occasions).where(eq(occasions.familyId, familyId));
  return rows
    .filter((o) => canSeeEvent({ audience: o.shareCircle, familyId }, m))
    .map((o) => ({
      id: o.id,
      title: o.title,
      kind: o.kind,
      date: `${o.year ?? '-'}-${String(o.month).padStart(2, '0')}-${String(o.day).padStart(2, '0')}`, // --MM-DD when the year isn't known
      lunar: o.lunar,
      childId: o.childId,
      memberAccountId: o.memberAccountId,
      shareCircle: o.shareCircle,
      canChange: canChangeOccasion(o, m),
    }));
}

/** "The days we celebrate" — the owner's choice (cleaned to known groups). */
export async function setCelebrate(db: DbHandle, accountId: string, familyId: string, groups: unknown): Promise<boolean> {
  if (!canSetCelebrate(await membershipIn(db, accountId, familyId), familyId)) return false;
  const chosen = cleanCelebrate(groups);
  await db.update(families).set({ celebrate: chosen }).where(eq(families.id, familyId));
  // accountability evidence of the explicit consent (Art 9) — that it changed and how many groups are
  // on, NEVER which: the choices themselves stay only on the family, deleted with it (DPIA addendum)
  await db.insert(auditRecords).values({ familyId, actorAccountId: accountId, actorType: 'MEMBER', event: 'CONSENT_CHANGED', targetType: 'family_celebrate', targetId: familyId, metadata: { groups: chosen.length } });
  return true;
}

// ── reminders: who is due a nudge ────────────────────────────────────────────────────────────
export interface DueItem {
  accountId: string;
  email: string;
  key: string;
  year: number;
  date: YMD;
  title: string;
  note: string | null;
}
/**
 * Every (recipient, occasion) pair inside the reminder horizon: recipients are the members who see
 * the family's calendar — and only the events their circle may see. Consent is the planner's job.
 */
export async function reminderCandidates(db: DbHandle, today: YMD, horizonDays: number): Promise<DueItem[]> {
  const to = addDays(today, horizonDays);
  const fams = await db.select({ id: families.id, displayName: families.displayName, celebrate: families.celebrate }).from(families);
  if (!fams.length) return [];
  const mems = await db
    .select({ m: memberships, email: accounts.email })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(and(inArray(memberships.familyId, fams.map((f) => f.id)), eq(memberships.status, 'ACTIVE')));
  const out: DueItem[] = [];
  for (const fam of fams) {
    const seers = mems.filter((x) => x.m.familyId === fam.id && (x.m.isOwner || x.m.seesOccasions));
    if (!seers.length) continue;
    const events = await familyEvents(db, fam, today, to, { festivals: true });
    for (const e of events) {
      for (const { m, email } of seers) {
        const cm: CalendarMembership = { familyId: m.familyId, accountId: m.accountId, circle: m.circle, accessLevel: m.accessLevel, status: m.status, isOwner: m.isOwner, seesOccasions: m.seesOccasions };
        if (!canSeeEvent(e, cm)) continue;
        out.push({ accountId: m.accountId, email, key: e.key, year: year(e.date), date: e.date, title: e.title, note: e.note });
      }
    }
  }
  return out;
}

export { daysBetween };
