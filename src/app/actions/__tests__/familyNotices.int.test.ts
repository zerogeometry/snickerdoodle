import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

/**
 * Sweep 04 fixes — the family's emails (reports/test-sweep-2026-10-29/04-family-invites.md). For each
 * one: WHO it goes to (only the right person), WHAT triggers it, and WHAT it says — first names only,
 * no child's name, no family surname, no pictures. Covers the invite (04-B11 — says who it's from),
 * "already in your family" (04-B4), the new notices (someone joined → the parent; removed / circle or
 * access changed → the member), the data download + deletion confirmations, and the reminder email's
 * real off switch (04-B10). The mailer is captured; nothing is sent anywhere.
 */
const actor = vi.hoisted(() => ({ current: null as null | { id: string; email: string; name: string | null } }));
const sent = vi.hoisted(() => [] as import('@/server/mail').MailMessage[]);
vi.mock('@/server/session', async (orig) => ({ ...(await orig<typeof import('@/server/session')>()), getCurrentAccount: async () => actor.current }));
vi.mock('@/auth', () => ({ auth: async () => null, signIn: vi.fn(), signOut: vi.fn(), handlers: {} }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-real-ip': '203.0.113.79' }),
  cookies: async () => ({ get: () => undefined, set: vi.fn(), delete: vi.fn(), getAll: () => [] }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('@/server/mail', async (orig) => ({ ...(await orig<typeof import('@/server/mail')>()), sendMail: vi.fn(async (m: import('@/server/mail').MailMessage) => void sent.push(m)) }));
vi.mock('@/server/rateLimit', async (orig) => ({ ...(await orig<typeof import('@/server/rateLimit')>()), rateLimit: vi.fn(async () => ({ ok: true, retryAfterSec: 0 })) }));

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, assets, children, consentRecords, families, invites, memberships, reminderSends } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import type { DbHandle } from '@/server/db';
import { acceptInvite } from '@/server/invites';
import { hasReminderConsent, runReminders, setReminderConsent, turnRemindersOffByLink } from '@/server/reminders';
import { reminderOffToken } from '@/server/mail/reminderOff';
import { ensureHomeFamily } from '@/server/onboarding';
import { createInviteAction } from '@/app/actions/invite';
import { removeMemberAction, resendInviteAction, setMemberAccessAction } from '@/app/actions/family';
import { closeMyAccountAction, deleteAllMyKeepsakesAction, exportMyDataAction } from '@/app/actions/data';
import { POST as oneClickOff } from '@/app/api/reminders/off/[token]/route';
import { exclusively } from '@/test/globalJobs';

const DB = process.env.DATABASE_URL;

describe.skipIf(!DB)('sweep 04 — family emails: who, when, what (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const nonce = randomUUID().slice(0, 8);
  const email: Record<string, string> = {};
  const extra: string[] = [];

  const newAccount = async (who: string, displayName: string | null = null) => {
    const addr = `notices-${who}-${nonce}@example.test`;
    const [a] = await db.insert(accounts).values({ email: addr, displayName }).returning();
    extra.push(a!.id);
    return { id: a!.id, email: addr, name: displayName };
  };
  /** Nothing an email may carry: a child's name, the family's (sur)name, a picture. */
  const clean = (m: { subject: string; text: string }) => {
    for (const s of [m.subject, m.text]) {
      expect(s).not.toMatch(/Olivia|Max\b|Hartley/);
      expect(s).not.toMatch(/\.(png|jpe?g|webp)\b|X-Amz-|\/api\/profile-image/i);
    }
  };
  /** A member who joined from a (verified) invite — the only way a membership exists. */
  const member = async (who: { id: string; email: string }, relationship: 'CLOSE_FRIEND' | 'OTHER', circle: 'EXTENDED' | 'FAMILY', accessLevel: 'VIEW' | 'VIEW_BUY' | 'CONTRIBUTE') => {
    const [inv] = await db
      .insert(invites)
      .values({ familyId: ids.hartleyId, createdByAccountId: ids.samId, email: who.email, relationship, circle, accessLevel, token: `tok-${randomUUID()}`, status: 'VERIFIED', expiresAt: new Date(Date.now() + 86_400_000) })
      .returning({ id: invites.id });
    await db.insert(memberships).values({ familyId: ids.hartleyId, accountId: who.id, relationship, circle, accessLevel, status: 'ACTIVE', isOwner: false, inviteId: inv!.id, joinedAt: new Date() });
  };
  const asSam = () => (actor.current = { id: ids.samId, email: email.sam!, name: 'Sam Hartley' });

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
    for (const [k, id] of Object.entries({ sam: ids.samId, jo: ids.joId, rosie: ids.rosieId, blake: ids.blakeId })) {
      email[k] = (await db.select({ e: accounts.email }).from(accounts).where(eq(accounts.id, id)))[0]!.e;
    }
    // the parent's account name has a surname in it — the emails must use the first name only
    await db.update(accounts).set({ displayName: 'Sam Hartley' }).where(eq(accounts.id, ids.samId));
  });
  beforeEach(() => void sent.splice(0));
  afterAll(async () => {
    const all = [ids.samId, ids.joId, ids.rosieId, ids.malloryId, ids.blakeId, ...extra];
    await db.delete(reminderSends).where(inArray(reminderSends.accountId, all));
    await db.delete(consentRecords).where(inArray(consentRecords.accountId, all));
    if (extra.length) {
      const owned = (await db.select({ id: families.id }).from(families).where(inArray(families.ownerAccountId, extra))).map((f) => f.id);
      if (owned.length) {
        await db.delete(assets).where(inArray(assets.familyId, owned));
        await db.delete(children).where(inArray(children.familyId, owned));
        await db.delete(memberships).where(inArray(memberships.familyId, owned));
        await db.delete(families).where(inArray(families.id, owned));
      }
      await db.delete(memberships).where(inArray(memberships.accountId, extra));
      await db.delete(accounts).where(inArray(accounts.id, extra));
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('04-B11: the invite says who it’s from (first name only) and goes to the invited address only', async () => {
    asSam();
    const granny = `granny-${nonce}@example.test`;
    expect(await createInviteAction({ email: ` ${granny.toUpperCase()} `, relationship: 'GRANDPARENT', accessLevel: 'VIEW', name: 'Granny Smith' })).toEqual({ ok: true });
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['family-invite', granny]]);
    const m = sent[0]!;
    expect(m.subject).toBe('Sam invited you to their family keepsake box');
    expect(m.text).toMatch(/^Hi Granny,/);
    expect(m.text).toContain('Sam has invited you to join their family’s private keepsake box');
    expect(m.text).toMatch(/\/join\/[A-Za-z0-9_-]{20,}/);
    expect(m.text).not.toContain('Smith');
    clean(m);

    // resend: same sender line, a fresh link, still only to them
    sent.splice(0);
    const [inv] = await db.select({ id: invites.id, token: invites.token }).from(invites).where(and(eq(invites.familyId, ids.hartleyId), eq(invites.email, granny)));
    expect(await resendInviteAction(inv!.id)).toEqual({ ok: true });
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['family-invite', granny]]);
    expect(sent[0]!.subject).toBe('a little reminder: Sam invited you to their family keepsake box');
    expect(sent[0]!.text).not.toContain(inv!.token); // the old link is dead; the new one is in the email
    clean(sent[0]!);
  });

  it('04-B4: inviting someone already in the family is refused with a reason — no invite, no email', async () => {
    asSam();
    expect(await createInviteAction({ email: email.rosie!, relationship: 'PARENT', accessLevel: 'CONTRIBUTE', name: 'Rosie' })).toEqual({ ok: false, reason: 'already-member' });
    expect(sent).toHaveLength(0);
    expect(await db.select().from(invites).where(and(eq(invites.email, email.rosie!), eq(invites.status, 'PENDING')))).toHaveLength(0);
  });

  it('someone joins → the controlling parent (only) hears who, and at what circle/access', async () => {
    asSam();
    const aunt = await newAccount('aunt', 'Bea Jones');
    await createInviteAction({ email: aunt.email, relationship: 'AUNT_UNCLE', accessLevel: 'VIEW_BUY', name: 'Bea' });
    const [inv] = await db.select({ token: invites.token }).from(invites).where(eq(invites.email, aunt.email));
    sent.splice(0);

    expect((await acceptInvite(db, aunt, inv!.token)).ok).toBe(true);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['family-joined', email.sam]]);
    const m = sent[0]!;
    expect(m.subject).toBe('Bea joined your family keepsake box ✦');
    expect(m.text).toMatch(/^Hi Sam,/);
    expect(m.text).toContain(`Bea (${aunt.email}) accepted your invite and joined your family as an aunt or uncle.`);
    expect(m.text).toContain('in the Extended family circle');
    expect(m.text).toContain('They can look and order gifts.');
    expect(m.text).toMatch(/\/family$/);
    expect(m.text).not.toContain('Jones');
    clean(m);
  });

  it('removed → the member (only) is told, with no list of what they’ve lost', async () => {
    asSam();
    const friend = await newAccount('friend', 'Kit');
    await member(friend, 'CLOSE_FRIEND', 'EXTENDED', 'VIEW');
    expect(await removeMemberAction(friend.id)).toEqual({ ok: true });
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['family-removed', friend.email]]);
    const m = sent[0]!;
    expect(m.subject).toBe('you’re no longer in Sam’s family on snickerdoodle');
    expect(m.text).toMatch(/^Hi Kit,/);
    expect(m.text).toContain('Sam has taken you out of their family keepsake box');
    expect(m.text).not.toMatch(/keepsakes? (called|named)|you can no longer see/i);
    clean(m);
  });

  it('circle / access changed → the member (only) hears their new place; no change → no email', async () => {
    asSam();
    const cousin = await newAccount('cousin', 'Ali');
    await member(cousin, 'OTHER', 'EXTENDED', 'VIEW');

    expect(await setMemberAccessAction(cousin.id, { circle: 'FAMILY', accessLevel: 'CONTRIBUTE' })).toEqual({ ok: true });
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['family-access-changed', cousin.email]]);
    expect(sent[0]!.subject).toBe('a little change to your place in Sam’s family');
    expect(sent[0]!.text).toContain('You\'re now in the Family circle');
    expect(sent[0]!.text).toContain('you can look, order gifts and add drawings');
    clean(sent[0]!);

    sent.splice(0);
    expect(await setMemberAccessAction(cousin.id, { accessLevel: 'CONTRIBUTE' })).toEqual({ ok: true }); // same as before
    expect(sent).toHaveLength(0);

    // someone who isn't the parent changes nothing and nobody is emailed
    actor.current = { id: ids.joId, email: email.jo!, name: 'Jo' };
    expect(await setMemberAccessAction(cousin.id, { accessLevel: 'VIEW' })).toEqual({ ok: false });
    expect(await removeMemberAction(cousin.id)).toEqual({ ok: false });
    expect(sent).toHaveLength(0);
  });

  it('a data download → a heads-up to the account’s own address only (nothing from the data in it)', async () => {
    const me = await newAccount('exporter', 'Robin Example');
    actor.current = me;
    const res = await exportMyDataAction(new Date().toISOString());
    expect(res.ok).toBe(true);
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['data-export', me.email]]);
    expect(sent[0]!.subject).toBe('your snickerdoodle data download');
    expect(sent[0]!.text).toMatch(/^Hi Robin,/);
    expect(sent[0]!.text).not.toContain('Example');
    expect(sent[0]!.replyTo).toBe('support@snickerdoodle.co.uk');
    clean(sent[0]!);
  });

  it('“delete all my keepsakes” → a note when it’s done (how many); nothing to delete → no email', async () => {
    const me = await newAccount('deleter', 'Pat');
    actor.current = me;
    const familyId = await ensureHomeFamily(db, me.id, me.name);
    const [kid] = await db.insert(children).values({ familyId, firstName: 'Ivy', controllerAccountId: me.id }).returning({ id: children.id });
    await db.insert(assets).values([
      { familyId, kind: 'DRAWING', uploaderAccountId: me.id, childSubjectId: kid!.id, controllerAccountId: me.id, visibility: 'FAMILY' },
      { familyId, kind: 'DRAWING', uploaderAccountId: me.id, childSubjectId: kid!.id, controllerAccountId: me.id, visibility: 'ONLY_ME' },
    ]);
    expect(await deleteAllMyKeepsakesAction(new Date().toISOString())).toEqual({ ok: true, deleted: 2, inOrders: 0 });
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['data-deleted', me.email]]);
    expect(sent[0]!.subject).toBe('your keepsakes have been deleted');
    expect(sent[0]!.text).toContain('we\'ve deleted 2 keepsakes');
    expect(sent[0]!.text).not.toContain('Ivy');
    clean(sent[0]!);

    sent.splice(0);
    expect(await deleteAllMyKeepsakesAction(new Date().toISOString())).toEqual({ ok: true, deleted: 0, inOrders: 0 });
    expect(sent).toHaveLength(0);
    await db.delete(children).where(eq(children.id, kid!.id));
  });

  it('closing the account → a last note to the address it had (sent after the account is erased)', async () => {
    const me = await newAccount('closer', 'Lee');
    actor.current = me;
    await ensureHomeFamily(db, me.id, me.name);
    expect(await closeMyAccountAction(null)).toEqual({ ok: true });
    const [row] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, me.id));
    expect(row!.email).toMatch(/@closed\.invalid$/); // really erased…
    expect(sent.map((m) => [m.kind, m.to])).toEqual([['data-deleted', me.email]]); // …and told at the old address
    expect(sent[0]!.subject).toBe('your snickerdoodle account is closed');
    clean(sent[0]!);
  });

  it('04-B10: the reminder carries a real off switch — no sign-in, and List-Unsubscribe for one tap in the mail app', () => exclusively(db, async () => {
    const d = new Date(Date.now() + 28 * 86_400_000);
    await db.update(children).set({ birthday: `2021-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}` }).where(eq(children.id, ids.oliviaId));
    await setReminderConsent(db, ids.samId, true, 'notices-test');
    await runReminders(db);
    const m = sent.find((x) => x.kind === 'reminder' && x.to === email.sam);
    expect(m).toBeDefined();
    const page = /\/reminders\/off\/([A-Za-z0-9_.-]+)/.exec(m!.text);
    expect(page, 'the off link').not.toBeNull();
    expect(m!.text).not.toContain('in one tap: '); // no promise the link can't keep
    expect(m!.headers?.['List-Unsubscribe']).toMatch(/^<https?:\/\/.+\/api\/reminders\/off\/.+>$/);
    expect(m!.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');

    // a tampered link does nothing; the real one turns reminders off for that account only
    const token = page![1]!;
    expect(token).toBe(reminderOffToken(ids.samId));
    expect(await turnRemindersOffByLink(db, `${ids.joId}.${token.split('.')[1]}`, 'email-link')).toEqual({ ok: false });
    expect(await hasReminderConsent(db, ids.samId)).toBe(true);
    const res = await oneClickOff(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ token }) });
    expect(res.status).toBe(200);
    expect(await hasReminderConsent(db, ids.samId)).toBe(false);
    const bad = await oneClickOff(new Request('http://x', { method: 'POST' }), { params: Promise.resolve({ token: 'nope.nope' }) });
    expect(bad.status).toBe(404);
  }));
});
