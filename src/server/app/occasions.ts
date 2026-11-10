import { and, asc, eq, isNull } from 'drizzle-orm';
import { occasions } from '@/db/schema';
import { addOccasion, deleteOccasion, updateOccasion, type OccasionInput } from '@/server/occasions';
import { containsAbusiveText, screenChildFirstName } from '@/server/textSafety';
import type { DbHandle } from '@/server/db';
import { AppApiError } from './api';
import { childInScope, type AppViewer } from './appAuth';

/**
 * Snickerdoodle Draw's "family birthdays and special days" ↔ the website's family calendar — one
 * list, both ways, only while the link's `birthdays` choice is on (DRAW-APP-sync-choices.md, founder
 * decisions 10 Nov, item 4). Mapped onto the calendar's own occasions and its own rules (the owner's
 * membership, screening, FAMILY circle by default): a name, an optional relation, birthday or other,
 * and the day and month — never a year, never a picture. Children's own birthdays are NOT here (they
 * travel with "first names and birthdays").
 */

export interface AppOccasion {
  id: string;
  name: string;
  relation?: string;
  kind: 'birthday' | 'other';
  month: number;
  day: number;
  updatedAt: string;
}

const UUID = /^[0-9a-f-]{36}$/i;
const RELATION = /^[\p{L}\p{M}'’ -]{1,30}$/u;

type Row = typeof occasions.$inferSelect;
const toApp = (o: Row): AppOccasion => ({
  id: o.id,
  name: o.title,
  ...(o.relation ? { relation: o.relation } : {}),
  kind: o.kind === 'BIRTHDAY' ? 'birthday' : 'other',
  month: o.month,
  day: o.day,
  updatedAt: o.updatedAt.toISOString(),
});

function requireBirthdays(av: AppViewer) {
  if (!av.sync.birthdays) throw new AppApiError(403, 'sync-off');
}

/** Which of the family's dates the app may see: not a lunar one (the app keeps fixed days), and not one
 * for a child this phone isn't for. */
const visibleToApp = (av: AppViewer, o: Row) => o.familyId === av.familyId && !o.lunar && (!o.childId || childInScope(av, o.childId));

/** A first name — one word, screened (the website's own rule for names). */
function cleanName(raw: unknown): string {
  const s = screenChildFirstName(typeof raw === 'string' ? raw : '');
  if (!s.ok || !s.value) throw new AppApiError(422, 'name');
  return s.value;
}
function cleanRelation(raw: unknown): string | null {
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string') throw new AppApiError(422, 'relation');
  const r = raw.replace(/\s+/g, ' ').trim();
  if (!r) return null;
  if (!RELATION.test(r) || containsAbusiveText(r)) throw new AppApiError(422, 'relation');
  return r;
}
function cleanKind(raw: unknown): 'BIRTHDAY' | 'OTHER' {
  if (raw === 'birthday') return 'BIRTHDAY';
  if (raw === 'other') return 'OTHER';
  throw new AppApiError(422, 'kind');
}
function cleanDay(month: unknown, day: unknown): { month: number; day: number } {
  if (typeof month !== 'number' || typeof day !== 'number' || !Number.isInteger(month) || !Number.isInteger(day)) throw new AppApiError(422, 'date');
  const probe = new Date(Date.UTC(2000, month - 1, day)); // 2000: a leap year, so 29 Feb is fine
  if (month < 1 || month > 12 || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) throw new AppApiError(422, 'date');
  return { month, day };
}
const mmdd = (year: number | null, month: number, day: number) => `${year ?? '-'}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

function failed(reason: string): never {
  if (reason === 'not-allowed') throw new AppApiError(403, 'not-owner');
  if (reason === 'words') throw new AppApiError(422, 'name');
  if (reason === 'date' || reason === 'lunar-needs-year') throw new AppApiError(422, 'date');
  throw new AppApiError(422, 'name');
}

async function appOccasion(db: DbHandle, av: AppViewer, id: string): Promise<Row> {
  if (!UUID.test(id)) throw new AppApiError(404, 'not-found');
  const [o] = await db.select().from(occasions).where(and(eq(occasions.id, id), eq(occasions.familyId, av.familyId)));
  if (!o || !visibleToApp(av, o)) throw new AppApiError(404, 'not-found');
  return o;
}

/** GET /occasions — the family calendar's own dates (oldest first). */
export async function listAppOccasions(db: DbHandle, av: AppViewer): Promise<AppOccasion[]> {
  requireBirthdays(av);
  const rows = await db.select().from(occasions).where(and(eq(occasions.familyId, av.familyId), isNull(occasions.lunar))).orderBy(asc(occasions.createdAt));
  return rows.filter((o) => visibleToApp(av, o)).map(toApp);
}

/** POST /occasions — { name, relation?, kind, month, day } → the new date, in the family calendar (FAMILY circle). */
export async function addAppOccasion(db: DbHandle, av: AppViewer, body: Record<string, unknown>): Promise<AppOccasion> {
  requireBirthdays(av);
  const name = cleanName(body.name);
  const relation = body.relation === undefined ? null : cleanRelation(body.relation);
  const kind = cleanKind(body.kind);
  const { month, day } = cleanDay(body.month, body.day);
  const res = await addOccasion(db, av.accountId, av.familyId, { title: name, kind, date: mmdd(null, month, day), relation, shareCircle: 'FAMILY' });
  if (!res.ok) failed(res.reason);
  return toApp((await db.select().from(occasions).where(eq(occasions.id, res.id)))[0]!);
}

/** PATCH /occasions/{id} — any subset of { name, relation, kind, month, day }. The year (if the website has one) is kept, never sent. */
export async function updateAppOccasion(db: DbHandle, av: AppViewer, id: string, body: Record<string, unknown>): Promise<AppOccasion> {
  requireBirthdays(av);
  const o = await appOccasion(db, av, id);
  const title = body.name === undefined ? o.title : cleanName(body.name);
  const relation = body.relation === undefined ? undefined : cleanRelation(body.relation);
  // 'other' on an anniversary or a milestone keeps what the website called it
  const kind: OccasionInput['kind'] = body.kind === undefined ? o.kind : cleanKind(body.kind) === 'BIRTHDAY' ? 'BIRTHDAY' : o.kind === 'BIRTHDAY' ? 'OTHER' : o.kind;
  const { month, day } = body.month === undefined && body.day === undefined ? o : cleanDay(body.month ?? o.month, body.day ?? o.day);
  const res = await updateOccasion(db, av.accountId, o.id, {
    title,
    kind,
    date: mmdd(o.year, month, day),
    lunar: o.lunar,
    childId: o.childId,
    memberAccountId: o.memberAccountId,
    shareCircle: o.shareCircle,
    ...(relation !== undefined ? { relation } : {}),
  });
  if (!res.ok) failed(res.reason);
  return toApp((await db.select().from(occasions).where(eq(occasions.id, o.id)))[0]!);
}

/** DELETE /occasions/{id} — gone from the family calendar too. */
export async function deleteAppOccasion(db: DbHandle, av: AppViewer, id: string): Promise<void> {
  requireBirthdays(av);
  const o = await appOccasion(db, av, id);
  if (!(await deleteOccasion(db, av.accountId, o.id))) throw new AppApiError(404, 'not-found');
}
