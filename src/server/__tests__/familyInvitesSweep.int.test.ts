import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { accounts, auditRecords, invites, memberships, storageObjects } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, canDeleteAsset, canSetAssetVisibility, canViewAsset } from '@/authz';
import { changeAssetVisibility, listViewableAssets, resolveViewerContext } from '@/server/assets';
import { acceptInvite, AlreadyInFamilyError, createInvite, getInviteForDisplay, setMemberSeesOccasions } from '@/server/invites';
import { removeMember, resendInvite, revokeInvite, setMemberAccess } from '@/server/members';
import { assetRefOf } from '@/server/assetRef';
import { ingestOriginalAsset } from '@/server/ingest';
import { copyKeepsake } from '@/server/keepsakeCopy';
import { deleteObject } from '@/storage';
import type { DbHandle } from '@/server/db';

/**
 * Test sweep 2026-10-29 (tester 04 — family, invites, notifications). Pins the invite edge cases the
 * existing invites/members suites don't: revoked / already-used / tampered / resent tokens, accepting
 * with the invited address in a different case, re-inviting after removal, a concurrent double-accept,
 * the calendar toggle's audit row, and that every family event lands in the audit log.
 * Bugs found are it.todo with their report id (reports/test-sweep-2026-10-29/04-family-invites.md).
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('test sweep 04 — invites, membership, audit (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const nonce = randomUUID().slice(0, 8);
  const extraAccounts: string[] = [];

  const newAccount = async (who: string) => {
    const email = `sweep04-${who}-${nonce}@example.test`;
    const [a] = await db.insert(accounts).values({ email, displayName: who }).returning();
    extraAccounts.push(a!.id);
    return { id: a!.id, email };
  };
  const owner = () => resolveViewerContext(db, ids.samId, ids.hartleyId);
  const audits = async (event: (typeof schema.auditEvent.enumValues)[number], targetId: string) =>
    db.select().from(auditRecords).where(and(eq(auditRecords.event, event), eq(auditRecords.targetId, targetId)));

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (extraAccounts.length) {
      await db.delete(memberships).where(inArray(memberships.accountId, extraAccounts));
      await db.delete(accounts).where(inArray(accounts.id, extraAccounts));
    }
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('an invite is logged (INVITE_SENT) with the circle the server derived — never the client', async () => {
    const who = await newAccount('aunt');
    const { inviteId } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'AUNT_UNCLE', accessLevel: 'CONTRIBUTE' });
    const [inv] = await db.select().from(invites).where(eq(invites.id, inviteId));
    expect(inv).toMatchObject({ circle: 'EXTENDED', accessLevel: 'CONTRIBUTE', status: 'PENDING' });
    const [row] = await audits('INVITE_SENT', inviteId);
    expect(row!.metadata).toMatchObject({ circle: 'EXTENDED', accessLevel: 'CONTRIBUTE' });
    // the expiry is a fortnight out
    const days = (inv!.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThanOrEqual(14);
  });

  it('a second parent (Family circle, CONTRIBUTE) and a removed member cannot invite', async () => {
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(createInvite(db, jo, { familyId: ids.hartleyId, email: `x-${nonce}@example.test`, relationship: 'GRANDPARENT', accessLevel: 'VIEW' })).rejects.toBeInstanceOf(AuthzError);
    const mallory = await resolveViewerContext(db, ids.malloryId, ids.hartleyId);
    await expect(createInvite(db, mallory, { familyId: ids.hartleyId, email: `y-${nonce}@example.test`, relationship: 'GRANDPARENT', accessLevel: 'VIEW' })).rejects.toBeInstanceOf(AuthzError);
    // and an owner of another family can't invite into this one
    const blake = await resolveViewerContext(db, ids.blakeId, ids.bloomId);
    await expect(createInvite(db, blake, { familyId: ids.hartleyId, email: `z-${nonce}@example.test`, relationship: 'PARENT', accessLevel: 'CONTRIBUTE' })).rejects.toBeInstanceOf(AuthzError);
  });

  it('tampered and unknown tokens find nothing (no membership is created)', async () => {
    const who = await newAccount('tamper');
    const { token } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW_BUY' });
    expect(token.length).toBeGreaterThanOrEqual(32); // 24 random bytes, base64url
    for (const bad of [`${token}x`, token.slice(0, -1), token.toUpperCase() === token ? token.toLowerCase() : token.toUpperCase(), 'not-a-token', '']) {
      expect(await acceptInvite(db, who, bad)).toMatchObject({ ok: false, reason: 'not-found' });
      expect(await getInviteForDisplay(db, bad)).toBeNull();
    }
    expect(await db.select().from(memberships).where(eq(memberships.accountId, who.id))).toHaveLength(0);
  });

  it('a revoked invite cannot be accepted, even by the right person', async () => {
    const who = await newAccount('revoked');
    const { inviteId, token } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW_BUY' });
    expect((await revokeInvite(db, await owner(), { familyId: ids.hartleyId, inviteId })).ok).toBe(true);
    expect((await getInviteForDisplay(db, token))?.status).toBe('REVOKED');
    expect(await acceptInvite(db, who, token)).toMatchObject({ ok: false, reason: 'used' });
    expect(await db.select().from(memberships).where(eq(memberships.accountId, who.id))).toHaveLength(0);
    expect(await audits('INVITE_REVOKED', inviteId)).toHaveLength(1);
  });

  it('resending an invite: the OLD link stops working, the new one joins; logged as a resend', async () => {
    const who = await newAccount('resend');
    const { inviteId, token: oldToken } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'CLOSE_FRIEND', accessLevel: 'VIEW' });
    const res = await resendInvite(db, await owner(), { familyId: ids.hartleyId, inviteId });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.token).not.toBe(oldToken);
    expect(res.email).toBe(who.email);
    expect(await acceptInvite(db, who, oldToken)).toMatchObject({ ok: false, reason: 'not-found' });
    expect((await acceptInvite(db, who, res.token)).ok).toBe(true);
    const sent = await audits('INVITE_SENT', inviteId);
    expect(sent.some((a) => (a.metadata as { resent?: boolean } | null)?.resent === true)).toBe(true);
    // a non-owner can't resend (or learn the new token)
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(resendInvite(db, jo, { familyId: ids.hartleyId, inviteId })).rejects.toBeInstanceOf(AuthzError);
  });

  it('accepting with the invited address in a different case works (identity is the address, not its case)', async () => {
    const who = await newAccount('casey');
    const { token } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW' });
    const res = await acceptInvite(db, { id: who.id, email: who.email.toUpperCase() }, token);
    expect(res.ok).toBe(true);
    const v = await resolveViewerContext(db, who.id, ids.hartleyId);
    expect(v.membership).toMatchObject({ status: 'ACTIVE', circle: 'EXTENDED', accessLevel: 'VIEW', isOwner: false });
    expect(await audits('INVITE_ACCEPTED', (await db.select().from(invites).where(eq(invites.token, token)))[0]!.id)).toHaveLength(1);
    expect(await audits('MEMBERSHIP_CREATED', who.id)).toHaveLength(1);
  });

  it('each circle × access the parent can choose is joined EXACTLY (relationship sets the circle)', async () => {
    const cases = [
      { rel: 'PARENT', access: 'CONTRIBUTE', circle: 'FAMILY' },
      { rel: 'PARENT', access: 'VIEW', circle: 'FAMILY' },
      { rel: 'GRANDPARENT', access: 'VIEW_BUY', circle: 'EXTENDED' },
      { rel: 'AUNT_UNCLE', access: 'CONTRIBUTE', circle: 'EXTENDED' },
      { rel: 'CLOSE_FRIEND', access: 'VIEW', circle: 'EXTENDED' },
      { rel: 'OTHER', access: 'VIEW_BUY', circle: 'EXTENDED' },
    ] as const;
    for (const c of cases) {
      const who = await newAccount(`m-${c.rel}-${c.access}`.toLowerCase());
      const { token } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: c.rel, accessLevel: c.access });
      expect((await acceptInvite(db, who, token)).ok).toBe(true);
      const v = await resolveViewerContext(db, who.id, ids.hartleyId);
      expect(v.membership, `${c.rel}/${c.access}`).toMatchObject({ status: 'ACTIVE', circle: c.circle, accessLevel: c.access });
      // what they then SEE: Family circle → FAMILY + EXTENDED (+ Jo's FAMILY one); Extended → EXTENDED only. Never ONLY_ME.
      const seen = (await listViewableAssets(db, ids.hartleyId, v)).map((a) => a.id).sort();
      const expected = c.circle === 'FAMILY' ? [ids.assetFamily, ids.assetExtended, ids.assetJoFamily].sort() : [ids.assetExtended];
      expect(seen, `${c.rel}/${c.access}`).toEqual(expected);
      expect(seen).not.toContain(ids.assetOnlyMe);
      expect(seen).not.toContain(ids.assetBloomFamily);
    }
  });

  it('re-inviting after removal: a fresh invite joins again, at the NEW invite’s circle/access', async () => {
    const who = await newAccount('again');
    const first = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'PARENT', accessLevel: 'CONTRIBUTE' });
    expect((await acceptInvite(db, who, first.token)).ok).toBe(true);
    expect((await removeMember(db, await owner(), { familyId: ids.hartleyId, memberAccountId: who.id })).ok).toBe(true);
    expect((await resolveViewerContext(db, who.id, ids.hartleyId)).membership?.status).toBe('REMOVED');
    // the old (spent) link can't bring them back
    expect(await acceptInvite(db, who, first.token)).toMatchObject({ ok: false, reason: 'used' });

    const second = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW' });
    expect((await acceptInvite(db, who, second.token)).ok).toBe(true);
    const v = await resolveViewerContext(db, who.id, ids.hartleyId);
    expect(v.membership).toMatchObject({ status: 'ACTIVE', circle: 'EXTENDED', accessLevel: 'VIEW' });
    const rows = await db.select().from(memberships).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, who.id)));
    expect(rows.map((r) => r.status).sort()).toEqual(['ACTIVE', 'REMOVED']);
  });

  it('two accepts of one invite at once never make two memberships', async () => {
    const who = await newAccount('race');
    const { token } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW_BUY' });
    const results = await Promise.allSettled([acceptInvite(db, who, token), acceptInvite(db, who, token)]);
    const values = results.map((r) => (r.status === 'fulfilled' ? r.value : null));
    expect(values.filter((v) => v?.ok)).toHaveLength(1);
    // (observed 2026-10-29: the loser is told "used"; under a tighter race the partial unique index would refuse it instead)
    const active = await db.select().from(memberships).where(and(eq(memberships.accountId, who.id), eq(memberships.status, 'ACTIVE')));
    expect(active).toHaveLength(1); // the partial unique index holds the line
  });

  it('changing a member’s circle and access bites on their very next read, each change audited', async () => {
    const who = await newAccount('promote');
    const { token } = await createInvite(db, await owner(), { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW' });
    await acceptInvite(db, who, token);
    let v = await resolveViewerContext(db, who.id, ids.hartleyId);
    const familyRef = assetRefOf((await db.select().from(schema.assets).where(eq(schema.assets.id, ids.assetFamily)))[0]!);
    expect(canViewAsset(familyRef, v).allowed).toBe(false);
    expect((await setMemberAccess(db, await owner(), { familyId: ids.hartleyId, memberAccountId: who.id, circle: 'FAMILY', accessLevel: 'VIEW_BUY' })).ok).toBe(true);
    v = await resolveViewerContext(db, who.id, ids.hartleyId);
    expect(canViewAsset(familyRef, v).allowed).toBe(true);
    expect((await audits('MEMBERSHIP_CIRCLE_CHANGED', who.id))[0]!.metadata).toEqual({ from: 'EXTENDED', to: 'FAMILY' });
    expect((await audits('MEMBERSHIP_ACCESS_CHANGED', who.id))[0]!.metadata).toEqual({ from: 'VIEW', to: 'VIEW_BUY' });
    // and back down: Family → Extended hides the FAMILY keepsake again at once
    await setMemberAccess(db, await owner(), { familyId: ids.hartleyId, memberAccountId: who.id, circle: 'EXTENDED' });
    expect(canViewAsset(familyRef, await resolveViewerContext(db, who.id, ids.hartleyId)).allowed).toBe(false);
  });

  it('turning the family calendar off for a member is owner-only and audited', async () => {
    expect((await setMemberSeesOccasions(db, await owner(), { familyId: ids.hartleyId, memberAccountId: ids.rosieId, on: false })).ok).toBe(true);
    const rows = await audits('MEMBERSHIP_ACCESS_CHANGED', ids.rosieId);
    expect(rows.some((r) => (r.metadata as { seesOccasions?: boolean }).seesOccasions === false)).toBe(true);
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(setMemberSeesOccasions(db, jo, { familyId: ids.hartleyId, memberAccountId: ids.rosieId, on: true })).rejects.toBeInstanceOf(AuthzError);
  });

  it('visibility: only the controlling parent changes it; each change is logged with from → to', async () => {
    const sam = await owner();
    await changeAssetVisibility(db, ids.assetExtended, sam, 'ONLY_ME');
    const rows = await audits('ASSET_VISIBILITY_CHANGED', ids.assetExtended);
    expect(rows.at(-1)!.metadata).toEqual({ from: 'EXTENDED', to: 'ONLY_ME' });
    // a FAMILY-circle co-parent can't flip the owner's child's keepsake
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    await expect(changeAssetVisibility(db, ids.assetFamily, jo, 'EXTENDED')).rejects.toThrow();
    // an Extended member now sees nothing at all (the only EXTENDED one went private)
    const rosie = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(await listViewableAssets(db, ids.hartleyId, rosie)).toHaveLength(0);
    await changeAssetVisibility(db, ids.assetExtended, sam, 'EXTENDED');
  });

  // 04-B4 (fixed): inviting someone who is ALREADY an active member used to be accepted and then silently
  // change nothing. Now it's refused up front (the parent changes their level from their card), and a
  // second invite still waiting when they join is spent, so an old link can't change their level later.
  it('04-B4: re-inviting an active member is refused up front; the membership is unchanged', async () => {
    const [rosie] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, ids.rosieId));
    const sam = await owner();
    const before = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(before.membership).toMatchObject({ circle: 'EXTENDED', accessLevel: 'VIEW_BUY', status: 'ACTIVE' });
    // any case: the address is matched the way the join check matches it
    await expect(createInvite(db, sam, { familyId: ids.hartleyId, email: rosie!.email.toUpperCase(), relationship: 'PARENT', accessLevel: 'CONTRIBUTE' })).rejects.toBeInstanceOf(AlreadyInFamilyError);
    expect(await db.select().from(invites).where(and(eq(invites.familyId, ids.hartleyId), eq(invites.email, rosie!.email), eq(invites.status, 'PENDING')))).toHaveLength(0);
    const after = await resolveViewerContext(db, ids.rosieId, ids.hartleyId);
    expect(after.membership).toMatchObject({ circle: 'EXTENDED', accessLevel: 'VIEW_BUY' });
  });

  it('04-B4: two invites to one address — joining with one spends the other, so it can never change their level later', async () => {
    const who = await newAccount('twice');
    const sam = await owner();
    const first = await createInvite(db, sam, { familyId: ids.hartleyId, email: who.email, relationship: 'GRANDPARENT', accessLevel: 'VIEW' });
    const second = await createInvite(db, sam, { familyId: ids.hartleyId, email: who.email, relationship: 'PARENT', accessLevel: 'CONTRIBUTE' });
    expect((await acceptInvite(db, who, first.token)).ok).toBe(true);
    const [left] = await db.select({ status: invites.status }).from(invites).where(eq(invites.id, second.inviteId));
    expect(left!.status).toBe('REVOKED');
    expect(await acceptInvite(db, who, second.token)).toMatchObject({ ok: false, reason: 'used' });
    const m = await resolveViewerContext(db, who.id, ids.hartleyId);
    expect(m.membership).toMatchObject({ circle: 'EXTENDED', accessLevel: 'VIEW' });
  });
});

const S3 = process.env.S3_ENDPOINT;

describe.skipIf(!URL || !S3)('test sweep 04 — who controls an edited copy (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const made: string[] = [];
  const png = () => sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 200, g: 100, b: 50 } } }).png().toBuffer();

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    const objs = made.length ? await db.select({ key: storageObjects.key }).from(storageObjects).where(inArray(storageObjects.assetId, made)) : [];
    for (const o of objs) await deleteObject(o.key).catch(() => {});
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('a relative’s edited copy of a drawing FILED under a little one stays the controlling parent’s', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true, childSubjectId: ids.oliviaId });
    made.push(src.assetId);
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId); // Family circle · CONTRIBUTE
    const copy = await copyKeepsake(db, jo, src.assetId);
    made.push(copy.assetId);
    const [row] = await db.select().from(schema.assets).where(eq(schema.assets.id, copy.assetId));
    expect(row!.controllerAccountId).toBe(ids.samId);
    expect(canSetAssetVisibility(assetRefOf(row!), jo)).toBe(false);
  });

  // 04-B1 (P0): copyKeepsake → ingestOriginalAsset makes the COPIER the controller when the drawing isn't
  // filed under a child. The relative can then set the copy to "only me": the controlling parent can no
  // longer see, re-share or delete a copy of their child's drawing inside their own family.
  // Fixed: the copy keeps the source's controller.
  it('04-B1: a relative’s edited copy of an UNFILED family drawing should stay under the parent’s control', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);
    const src = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    made.push(src.assetId);
    const jo = await resolveViewerContext(db, ids.joId, ids.hartleyId);
    const copy = await copyKeepsake(db, jo, src.assetId);
    made.push(copy.assetId);
    await changeAssetVisibility(db, copy.assetId, jo, 'ONLY_ME').catch(() => {});
    const [row] = await db.select().from(schema.assets).where(eq(schema.assets.id, copy.assetId));
    const ref = assetRefOf(row!);
    expect(row!.controllerAccountId).toBe(ids.samId);
    expect(row!.visibility).toBe('FAMILY'); // the relative's "only me" was refused
    expect(canViewAsset(ref, sam).allowed).toBe(true);
    expect(canDeleteAsset(ref, sam)).toBe(true);
  });
});
