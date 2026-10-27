import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, auditRecords, children, invites, memberships, sessions } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, canViewAsset } from '@/authz';
import { assetRefOf, resolveViewerContext } from '@/server/assets';
import { addChild, deleteChild, updateChild } from '@/server/children';
import { leaveFamily, removeMember, revokeInvite, setMemberAccess } from '@/server/members';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/**
 * The parent's controls over the family (parent-is-controller): remove a member (immediate, no
 * session grace), change circle/access, cancel a pending invite, a member leaving, and editing /
 * removing a little one. Owner-only, family-scoped, audited.
 */
describe.skipIf(!DB)('parent controls — members, invites, children', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  const owner = () => resolveViewerContext(db, ids.samId, ids.hartleyId);
  const audited = async (event: (typeof schema.auditEvent.enumValues)[number], targetId: string) =>
    (await db.select().from(auditRecords).where(and(eq(auditRecords.event, event), eq(auditRecords.targetId, targetId)))).length > 0;
  const assetRef = async (id: string) => {
    const [a] = await db.select().from(assets).where(eq(assets.id, id));
    return assetRefOf(a!);
  };

  it('a non-owner can change nothing', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId); // FAMILY · CONTRIBUTE, but not owner
    await expect(removeMember(db, jo, { familyId: ids.hartleyId, memberAccountId: ids.rosieId })).rejects.toBeInstanceOf(AuthzError);
    await expect(setMemberAccess(db, jo, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, circle: 'FAMILY' })).rejects.toBeInstanceOf(AuthzError);
    expect((await updateChild(db, jo, { familyId: ids.hartleyId, childId: ids.oliviaId, firstName: 'Liv' })).ok).toBe(false);
    expect((await deleteChild(db, jo, { familyId: ids.hartleyId, childId: ids.oliviaId, alsoDeleteKeepsakes: false })).ok).toBe(false);
  });

  it('an owner of ANOTHER family cannot reach into this one', async () => {
    const blake = await resolveViewerContext(db, ids.blakeId, ids.bloomId);
    await expect(removeMember(db, blake, { familyId: ids.hartleyId, memberAccountId: ids.joId })).rejects.toBeInstanceOf(AuthzError);
    expect((await deleteChild(db, blake, { familyId: ids.bloomId, childId: ids.oliviaId, alsoDeleteKeepsakes: true })).ok).toBe(false);
  });

  it('changing circle + access takes effect at once and audits each change separately', async () => {
    const sam = await owner();
    // Rosie is EXTENDED: she can see the EXTENDED keepsake but not the FAMILY one
    let rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(canViewAsset(await assetRef(ids.assetFamily), rosie).allowed).toBe(false);

    expect((await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, circle: 'FAMILY', accessLevel: 'CONTRIBUTE' })).ok).toBe(true);
    rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(rosie.membership).toMatchObject({ circle: 'FAMILY', accessLevel: 'CONTRIBUTE' });
    expect(canViewAsset(await assetRef(ids.assetFamily), rosie).allowed).toBe(true);
    expect(await audited('MEMBERSHIP_CIRCLE_CHANGED', ids.rosieId)).toBe(true);
    expect(await audited('MEMBERSHIP_ACCESS_CHANGED', ids.rosieId)).toBe(true);

    // back to how she was
    await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, circle: 'EXTENDED', accessLevel: 'VIEW_BUY' });
  });

  it('rejects values outside the closed sets, and never touches the owner’s own membership', async () => {
    const sam = await owner();
    expect((await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, circle: 'PUBLIC' as never })).ok).toBe(false);
    expect((await setMemberAccess(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.samId, circle: 'EXTENDED' })).ok).toBe(false);
    expect((await removeMember(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.samId })).ok).toBe(false);
  });

  it('removing a member denies them immediately and signs them out everywhere (no session grace)', async () => {
    const sam = await owner();
    await db.insert(sessions).values({ sessionToken: `t-${ids.nonce}-jo`, userId: ids.joId, expires: new Date(Date.now() + 86_400_000) });
    let jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    expect(canViewAsset(await assetRef(ids.assetFamily), jo).allowed).toBe(true);

    expect((await removeMember(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId })).ok).toBe(true);

    jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    expect(jo.membership?.status).toBe('REMOVED'); // only ACTIVE memberships confer anything
    expect(canViewAsset(await assetRef(ids.assetFamily), jo).allowed).toBe(false);
    expect(canViewAsset(await assetRef(ids.assetExtended), jo).allowed).toBe(false);
    expect(await db.select().from(sessions).where(eq(sessions.userId, ids.joId))).toHaveLength(0);
    const [m] = await db.select().from(memberships).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.joId)));
    expect(m!.status).toBe('REMOVED');
    expect(m!.revokedAt).not.toBeNull();
    expect(await audited('MEMBER_REMOVED', ids.joId)).toBe(true);
    // removing twice is a no-op, not an error
    expect((await removeMember(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.joId })).ok).toBe(false);
  });

  it('a member can leave; the owner cannot leave their own family', async () => {
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect((await leaveFamily(db, rosie, { familyId: ids.hartleyId })).ok).toBe(true);
    const gone = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(gone.membership?.status).toBe('LEFT');
    expect(canViewAsset(await assetRef(ids.assetExtended), gone).allowed).toBe(false);
    expect(await audited('MEMBER_LEFT', ids.rosieId)).toBe(true);

    expect((await leaveFamily(db, await owner(), { familyId: ids.hartleyId })).ok).toBe(false);
  });

  it('cancelling a pending invite revokes it (and only a PENDING one)', async () => {
    const sam = await owner();
    const [inv] = await db
      .insert(invites)
      .values({
        familyId: ids.hartleyId,
        createdByAccountId: ids.samId,
        email: `nan-${ids.nonce}@example.test`,
        relationship: 'GRANDPARENT',
        circle: 'EXTENDED',
        accessLevel: 'VIEW_BUY',
        token: `inv-${ids.nonce}`,
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .returning({ id: invites.id });
    expect((await revokeInvite(db, sam, { familyId: ids.hartleyId, inviteId: inv!.id })).ok).toBe(true);
    const [after] = await db.select().from(invites).where(eq(invites.id, inv!.id));
    expect(after!.status).toBe('REVOKED');
    expect(await audited('INVITE_REVOKED', inv!.id)).toBe(true);
    expect((await revokeInvite(db, sam, { familyId: ids.hartleyId, inviteId: inv!.id })).ok).toBe(false);
  });

  it('edits a little one: first name screened (no surname), birthday validated, audit holds no values', async () => {
    const sam = await owner();
    expect(await updateChild(db, sam, { familyId: ids.hartleyId, childId: ids.oliviaId, firstName: 'Olivia Hartley' })).toEqual({ ok: false, reason: 'surname' });
    expect(await updateChild(db, sam, { familyId: ids.hartleyId, childId: ids.oliviaId, firstName: 'max' })).toEqual({ ok: false, reason: 'taken' });
    expect(await updateChild(db, sam, { familyId: ids.hartleyId, childId: ids.oliviaId, birthday: '2999-01-01' })).toEqual({ ok: false, reason: 'birthday' });

    expect(await updateChild(db, sam, { familyId: ids.hartleyId, childId: ids.oliviaId, firstName: 'Liv', birthday: '2020-03-14' })).toEqual({ ok: true });
    const [c] = await db.select().from(children).where(eq(children.id, ids.oliviaId));
    expect(c).toMatchObject({ firstName: 'Liv', birthday: '2020-03-14' });

    const [a] = await db.select().from(auditRecords).where(and(eq(auditRecords.event, 'CHILD_UPDATED'), eq(auditRecords.targetId, ids.oliviaId)));
    expect(a!.metadata).toEqual({ fields: ['firstName', 'birthday'] });
    expect(JSON.stringify(a!.metadata)).not.toContain('Liv');

    await updateChild(db, sam, { familyId: ids.hartleyId, childId: ids.oliviaId, birthday: null });
    const [cleared] = await db.select().from(children).where(eq(children.id, ids.oliviaId));
    expect(cleared!.birthday).toBeNull();
  });

  it('removing a little one can keep their keepsakes (unfiled) — nothing else is lost', async () => {
    const sam = await owner();
    const added = await addChild(db, sam, { familyId: ids.hartleyId, firstName: 'Pip' });
    if (!added.ok) throw new Error('addChild failed');
    await db.update(assets).set({ childSubjectId: added.child.id }).where(eq(assets.id, ids.assetOnlyMe));

    const res = await deleteChild(db, sam, { familyId: ids.hartleyId, childId: added.child.id, alsoDeleteKeepsakes: false });
    expect(res).toEqual({ ok: true, keepsakesDeleted: 0 });
    expect(await db.select().from(children).where(eq(children.id, added.child.id))).toHaveLength(0);
    const [kept] = await db.select().from(assets).where(eq(assets.id, ids.assetOnlyMe));
    expect(kept!.childSubjectId).toBeNull(); // still in the family box, just unfiled
    expect(await audited('CHILD_DELETED', added.child.id)).toBe(true);
  });
});
