import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { children, families, memberships, occasions } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { addOccasion, deleteOccasion, loadCalendar, reminderCandidates, setCelebrate, updateOccasion } from '@/server/occasions';
import { addDays } from '@/server/occasions/dates';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/**
 * The family calendar (founder, 27 Oct): occasions reach exactly the circle they're shared with, only
 * people the owner shared the calendar with, across families; festivals only on the family's own page.
 */
describe.skipIf(!DB)('the family calendar — who sees which dates', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const NOWHERE = '00000000-0000-0000-0000-000000000000';
  const today = new Date().toISOString().slice(0, 10);
  const in20 = addDays(today, 20);
  const md = in20.slice(4); // -MM-DD
  const from = today, to = addDays(today, 400);

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    // Jo (Family circle, contributes) and Rosie (Extended, view & buy) see the Hartleys' calendar
    await db.update(memberships).set({ seesOccasions: true }).where(and(eq(memberships.familyId, ids.hartleyId), inArray(memberships.accountId, [ids.joId, ids.rosieId])));
  });
  afterAll(async () => {
    if (ids) {
      await db.delete(occasions).where(inArray(occasions.familyId, [ids.hartleyId, ids.bloomId]));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  const titles = async (accountId: string, home = NOWHERE) => (await loadCalendar(db, accountId, home, from, to)).filter((e) => e.familyId === ids.hartleyId).map((e) => e.title);

  it('an occasion reaches its circle: FAMILY → the Family circle; EXTENDED → everyone with the calendar', async () => {
    const fam = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'Granny & grandad’s 40th', kind: 'ANNIVERSARY', date: `1986${md}` });
    const ext = await addOccasion(db, ids.samId, ids.hartleyId, { title: 'Rosie’s birthday', kind: 'BIRTHDAY', date: `--${md.slice(1)}`, shareCircle: 'EXTENDED' });
    expect(fam.ok && ext.ok).toBe(true);

    expect(await titles(ids.joId)).toEqual(expect.arrayContaining(['Granny & grandad’s 40th', 'Rosie’s birthday']));
    const rosie = await titles(ids.rosieId);
    expect(rosie).toContain('Rosie’s birthday');
    expect(rosie).not.toContain('Granny & grandad’s 40th'); // Family circle only
    expect(await titles(ids.blakeId)).toEqual([]); // another family entirely
    expect(await titles(ids.malloryId)).toEqual([]); // removed: nothing
  });

  it('nobody the owner didn’t share the calendar with sees anything', async () => {
    await db.update(memberships).set({ seesOccasions: false }).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.rosieId)));
    expect(await titles(ids.rosieId)).toEqual([]);
    await db.update(memberships).set({ seesOccasions: true }).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.rosieId)));
  });

  it('notes: the anniversary counts its years; another family’s festivals never repeat on your calendar', async () => {
    const sam = await loadCalendar(db, ids.samId, ids.hartleyId, from, to);
    const anniv = sam.find((e) => e.title === 'Granny & grandad’s 40th')!;
    expect(anniv.note).toMatch(/anniversary$/);
    expect(anniv.own).toBe(true);
    expect(sam.some((e) => e.kind === 'festival')).toBe(true); // the Hartleys celebrate Christmas by default
    expect((await loadCalendar(db, ids.joId, NOWHERE, from, to)).some((e) => e.kind === 'festival')).toBe(false); // Jo sees the Hartleys' dates, not their festivals
  });

  it('who may add and change: the owner and contributors add; viewers and buyers don’t; contributors change only their own', async () => {
    expect(await addOccasion(db, ids.rosieId, ids.hartleyId, { title: 'x', kind: 'OTHER', date: '--12-01' })).toEqual({ ok: false, reason: 'not-allowed' });
    const jo = await addOccasion(db, ids.joId, ids.hartleyId, { title: 'Sports day', kind: 'OTHER', date: '--06-20' });
    expect(jo.ok).toBe(true);
    const [samOcc] = await db.select().from(occasions).where(and(eq(occasions.familyId, ids.hartleyId), eq(occasions.createdByAccountId, ids.samId)));
    expect((await updateOccasion(db, ids.joId, samOcc!.id, { title: 'mine now', kind: 'OTHER', date: '--01-01' })).ok).toBe(false);
    expect((await updateOccasion(db, ids.samId, (jo as { id: string }).id, { title: 'Sports day!', kind: 'OTHER', date: '--06-21' })).ok).toBe(true);
    expect(await deleteOccasion(db, ids.rosieId, (jo as { id: string }).id)).toBe(false);
    expect(await deleteOccasion(db, ids.joId, (jo as { id: string }).id)).toBe(true);
  });

  it('screened, and a lunar date needs its year', async () => {
    expect(await addOccasion(db, ids.samId, ids.hartleyId, { title: 'shit day', kind: 'OTHER', date: '--05-05' })).toEqual({ ok: false, reason: 'words' });
    expect(await addOccasion(db, ids.samId, ids.hartleyId, { title: 'Halmeoni’s birthday', kind: 'BIRTHDAY', date: '--03-03', lunar: 'KOREAN' })).toEqual({ ok: false, reason: 'lunar-needs-year' });
    expect(await addOccasion(db, ids.samId, ids.hartleyId, { title: 'nope', kind: 'OTHER', date: '2026-02-30' })).toEqual({ ok: false, reason: 'date' });
    // "who it's for" must be in the family
    const [bloomKid] = await db.select({ id: children.id }).from(children).where(eq(children.familyId, ids.bloomId));
    if (bloomKid) expect((await addOccasion(db, ids.samId, ids.hartleyId, { title: 'x', kind: 'BIRTHDAY', date: '--01-01', childId: bloomKid.id })).ok).toBe(false);
  });

  it('the days we celebrate: the owner’s choice; Chinese New Year appears once chosen', async () => {
    expect(await setCelebrate(db, ids.joId, ids.hartleyId, ['east-asian-cn'])).toBe(false);
    expect(await setCelebrate(db, ids.samId, ids.hartleyId, ['everyday', 'east-asian-cn', 'not-a-group'])).toBe(true);
    const [f] = await db.select({ c: families.celebrate }).from(families).where(eq(families.id, ids.hartleyId));
    expect(f!.c).toEqual(['everyday', 'east-asian-cn']);
    const cal = await loadCalendar(db, ids.samId, ids.hartleyId, '2027-01-01', '2027-12-31');
    expect(cal.find((e) => e.title === 'Chinese New Year')?.date).toBe('2027-02-06');
    expect(cal.some((e) => e.title === 'Christmas Day')).toBe(false); // no longer chosen
  });

  it('reminders go to exactly who may see each date', async () => {
    const due = (await reminderCandidates(db, today, 31)).filter((c) => c.key.startsWith('occ:'));
    const who = (title: string) => due.filter((d) => d.title === title).map((d) => d.accountId).sort();
    expect(who('Granny & grandad’s 40th')).toEqual([ids.joId, ids.samId].sort());
    expect(who('Rosie’s birthday')).toEqual([ids.joId, ids.rosieId, ids.samId].sort());
  });
});
