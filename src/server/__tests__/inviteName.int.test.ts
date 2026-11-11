import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOIN_CONSENT_VERSION } from '@/lib/joinConsent';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, auditRecords, invites, memberships } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveViewerContext } from '@/server/assets';
import { acceptInvite, createInvite, inviterForSignInLink } from '@/server/invites';
import { updateDisplayName } from '@/server/profile';
import type { DbHandle } from '@/server/db';

/**
 * The name the parent types in the invite sheet sticks (founder, 10 Nov 2026: "it remembers her as
 * the email prefix rather than the name I assigned her"). A new account, or one still showing only
 * the stand-in (no name / the email's first part), takes the invited name on joining; a name the
 * person chose themselves is never overwritten; they can still change it after. Skipped without
 * DATABASE_URL.
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('the invited name sticks — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const nonce = randomUUID().slice(0, 8);
  const made: string[] = [];

  async function account(email: string, displayName: string | null) {
    const [a] = await db.insert(accounts).values({ email, displayName }).returning();
    made.push(a!.id);
    return a!;
  }
  const nameOf = async (id: string) => (await db.select({ n: accounts.displayName }).from(accounts).where(eq(accounts.id, id)))[0]!.n;
  async function inviteAndJoin(acct: { id: string; email: string }, name: string | null) {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const inv = await createInvite(db, sam, { familyId: ids.hartleyId, email: acct.email, relationship: 'PARENT', accessLevel: 'CONTRIBUTE', name });
    expect(await acceptInvite(db, acct, inv.token, { version: JOIN_CONSENT_VERSION })).toMatchObject({ ok: true }); // they said yes (D27)
    return inv;
  }

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (made.length) {
      await db.delete(memberships).where(inArray(memberships.accountId, made));
      await db.delete(invites).where(inArray(invites.email, (await db.select({ e: accounts.email }).from(accounts).where(inArray(accounts.id, made))).map((r) => r.e)));
      await db.delete(accounts).where(inArray(accounts.id, made));
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('the name is kept on the invite — screened, spaces tidied', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const a = await createInvite(db, sam, { familyId: ids.hartleyId, email: `kept-${nonce}@example.com`, relationship: 'PARENT', accessLevel: 'VIEW', name: '  Jo   Parker ' });
    expect(a.inviteeName).toBe('Jo Parker');
    const [row] = await db.select({ n: invites.inviteeName }).from(invites).where(eq(invites.id, a.inviteId));
    expect(row!.n).toBe('Jo Parker');
    // an abusive or over-long name is dropped — the invite still goes, just without a name
    for (const bad of ['shithead', 'x'.repeat(41)]) {
      const b = await createInvite(db, sam, { familyId: ids.hartleyId, email: `bad-${randomUUID().slice(0, 6)}-${nonce}@example.com`, relationship: 'GRANDPARENT', accessLevel: 'VIEW', name: bad });
      expect(b.inviteeName).toBeNull();
    }
  });

  it('a NEW account (no name yet) takes the name the parent gave — and can still change it', async () => {
    const wife = await account(`new-${nonce}@example.com`, null); // what sign-up makes: no name
    const inv = await inviteAndJoin(wife, 'Hannah');
    expect(await nameOf(wife.id)).toBe('Hannah');
    const [log] = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, wife.id), eq(auditRecords.event, 'PROFILE_UPDATED')));
    expect(log!.metadata).toMatchObject({ field: 'name', from: 'invite', inviteId: inv.inviteId });
    // their own change still works, and is theirs from now on
    expect(await updateDisplayName(db, wife.id, 'Han')).toEqual({ ok: true, name: 'Han' });
    expect(await nameOf(wife.id)).toBe('Han');
  });

  it('an EXISTING account still showing only the email’s first part takes the invited name', async () => {
    const prefix = `aunty-${nonce}`;
    const a = await account(`${prefix}@example.com`, prefix);
    await inviteAndJoin(a, 'Aunty May');
    expect(await nameOf(a.id)).toBe('Aunty May');
    const blank = await account(`blank-${nonce}@example.com`, '   ');
    await inviteAndJoin(blank, 'Bea');
    expect(await nameOf(blank.id)).toBe('Bea');
  });

  it('an existing account with a name they chose keeps it — never overwritten', async () => {
    const a = await account(`chosen-${nonce}@example.com`, 'Grandma Rose');
    await inviteAndJoin(a, 'Mum');
    expect(await nameOf(a.id)).toBe('Grandma Rose');
    // even when the name they typed happens to be their email's first part
    const prefix = `pip-${nonce}`;
    const b = await account(`${prefix}@example.com`, null);
    expect((await updateDisplayName(db, b.id, prefix)).ok).toBe(true);
    await inviteAndJoin(b, 'Philippa');
    expect(await nameOf(b.id)).toBe(prefix);
  });

  it('no name on the invite ⇒ nothing changes', async () => {
    const a = await account(`noname-${nonce}@example.com`, null);
    await inviteAndJoin(a, null);
    expect(await nameOf(a.id)).toBeNull();
  });

  it('the join sign-in email can say who invited them — only for that address, only while the invite is open', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const email = `signin-${nonce}@example.com`;
    const { token } = await createInvite(db, sam, { familyId: ids.hartleyId, email, relationship: 'GRANDPARENT', accessLevel: 'VIEW', name: 'Nan' });
    expect(await inviterForSignInLink(db, email, `https://snickerdoodle.co.uk/join/${token}`)).toBe('Sam');
    expect(await inviterForSignInLink(db, email.toUpperCase(), `/join/${token}`)).toBe('Sam');
    expect(await inviterForSignInLink(db, `someone-else-${nonce}@example.com`, `/join/${token}`)).toBeNull(); // not theirs to see
    expect(await inviterForSignInLink(db, email, '/home')).toBeNull();
    expect(await inviterForSignInLink(db, email, null)).toBeNull();
    expect(await inviterForSignInLink(db, email, `/join/${token}x`)).toBeNull(); // an unknown invite
    await db.update(invites).set({ status: 'REVOKED' }).where(eq(invites.token, token));
    expect(await inviterForSignInLink(db, email, `/join/${token}`)).toBeNull(); // cancelled: plain email
  });
});
