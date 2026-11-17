import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, auditRecords } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError, canViewAsset } from '@/authz';
import { fileAsset, resolveViewerContext } from '@/server/assets';
import { keepUpload } from '@/server/keepsakes';
import { assetRefOf } from '@/server/assetRef';
import type { DbHandle } from '@/server/db';
import type { VisibilityTier } from '@/domain/types';

const DB = process.env.DATABASE_URL;

/**
 * The keep tab + the person button (founder, 17 Nov 2026): keep with a chosen "who can see", and file a keepsake
 * in a little one's corner. Touches visibility + ownership, so it ships with tests (CLAUDE.md). Seed: Hartley —
 * Sam (leader, parent of Olivia + Max), Jo (CONTRIBUTE parent), Rosie (VIEW_BUY grandparent), Mallory (removed);
 * Bloom — Blake.
 */
describe.skipIf(!DB)('filing + keeping with a choice (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const extra: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (ids) {
      if (extra.length) await db.delete(assets).where(inArray(assets.id, extra));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  /** A kept keepsake in Hartley someone added (unfiled). */
  async function kept(adder: string, visibility: VisibilityTier = 'FAMILY') {
    const id = randomUUID();
    extra.push(id);
    await db.insert(assets).values({ id, familyId: ids.hartleyId, kind: 'DRAWING', uploaderAccountId: adder, controllerAccountId: adder, visibility, moderationStatus: 'CLEAR', keptInHome: true });
    return id;
  }

  async function draft() {
    const assetId = randomUUID();
    const claimId = randomUUID();
    extra.push(assetId);
    await db.insert(assets).values({
      id: assetId,
      familyId: null,
      kind: 'DRAWING',
      ephemeralClaimId: claimId,
      moderationStatus: 'CLEAR',
      keptInHome: false,
      purgeAfter: new Date(Date.now() + 30 * 86_400_000),
      termsAcceptedAt: new Date(),
      termsVersion: 'test-v1',
    });
    return { assetId, claimId };
  }

  const as = (accountId: string, familyId = ids.hartleyId) => resolveViewerContext(db, accountId, familyId);
  const row = async (id: string) => (await db.select().from(assets).where(eq(assets.id, id)))[0]!;

  describe('keeping from the keep tab — who can see is chosen BEFORE it goes in the box', () => {
    it('a draft goes in at the chosen tier (only me), kept and off the clock, in one write', async () => {
      const a = await draft();
      expect(await keepUpload(db, { id: ids.samId, name: 'Sam' }, [a.claimId], a.assetId, { visibility: 'ONLY_ME' })).toBe(true);
      const r = await row(a.assetId);
      expect([r.familyId, r.uploaderAccountId, r.visibility, r.keptInHome, r.purgeAfter]).toEqual([ids.hartleyId, ids.samId, 'ONLY_ME', true, null]);
      // Rosie (extended) and Jo (family) don't see an "only me" keepsake
      expect(canViewAsset(assetRefOf(r), await as(ids.joId)).allowed).toBe(false);
      expect(canViewAsset(assetRefOf(r), await as(ids.rosieId)).allowed).toBe(false);
    });

    it('with no choice it stays FAMILY (privacy by default)', async () => {
      const a = await draft();
      expect(await keepUpload(db, { id: ids.joId, name: 'Jo' }, [a.claimId], a.assetId)).toBe(true);
      expect((await row(a.assetId)).visibility).toBe('FAMILY');
    });

    it('a bogus tier is ignored, never stored', async () => {
      const a = await draft();
      expect(await keepUpload(db, { id: ids.samId, name: 'Sam' }, [a.claimId], a.assetId, { visibility: 'PUBLIC' as VisibilityTier })).toBe(true);
      expect((await row(a.assetId)).visibility).toBe('FAMILY');
    });

    it('someone else’s draft (no claim) can’t be kept, whatever tier is asked for', async () => {
      const a = await draft();
      expect(await keepUpload(db, { id: ids.samId, name: 'Sam' }, [], a.assetId, { visibility: 'EXTENDED' })).toBe(false);
      expect((await row(a.assetId)).familyId).toBeNull();
    });
  });

  describe('filing — only whoever added it; once in a child’s corner, only that child’s parent', () => {
    it('Jo files her own keepsake under Olivia: Sam (Olivia’s parent) gets a say, Jo stays the adder; it’s logged', async () => {
      const id = await kept(ids.joId);
      await fileAsset(db, id, await as(ids.joId), ids.oliviaId);
      const r = await row(id);
      expect([r.childSubjectId, r.controllerAccountId, r.uploaderAccountId, r.visibility, r.parentLimit]).toEqual([ids.oliviaId, ids.samId, ids.joId, 'FAMILY', null]);
      const [log] = await db.select().from(auditRecords).where(and(eq(auditRecords.targetId, id), eq(auditRecords.event, 'ASSET_VISIBILITY_CHANGED')));
      expect(log?.actorAccountId).toBe(ids.joId);
      expect(log?.metadata).toMatchObject({ kind: 'filed', fromChild: null, toChild: ids.oliviaId, fromController: ids.joId, toController: ids.samId });
    });

    it('the family leader can’t file a keepsake someone else added', async () => {
      const id = await kept(ids.joId);
      await expect(fileAsset(db, id, await as(ids.samId), ids.oliviaId)).rejects.toBeInstanceOf(AuthzError);
      expect((await row(id)).childSubjectId).toBeNull();
    });

    it('once it’s in Olivia’s corner: Sam may move it to Max, but not take it out; Jo can’t move it at all', async () => {
      const id = await kept(ids.joId);
      await fileAsset(db, id, await as(ids.joId), ids.oliviaId);
      await expect(fileAsset(db, id, await as(ids.joId), null)).rejects.toBeInstanceOf(AuthzError);
      await expect(fileAsset(db, id, await as(ids.joId), ids.maxId)).rejects.toBeInstanceOf(AuthzError);
      await expect(fileAsset(db, id, await as(ids.samId), null)).rejects.toBeInstanceOf(AuthzError);
      await fileAsset(db, id, await as(ids.samId), ids.maxId);
      expect([(await row(id)).childSubjectId, (await row(id)).controllerAccountId]).toEqual([ids.maxId, ids.samId]);
    });

    it('the leader files their own keepsake and takes it back out', async () => {
      const id = await kept(ids.samId);
      await fileAsset(db, id, await as(ids.samId), ids.maxId);
      expect((await row(id)).childSubjectId).toBe(ids.maxId);
      await fileAsset(db, id, await as(ids.samId), null);
      expect([(await row(id)).childSubjectId, (await row(id)).controllerAccountId]).toEqual([null, ids.samId]);
    });

    it('a removed member, another family, and a child from another family are all refused', async () => {
      const id = await kept(ids.samId);
      await expect(fileAsset(db, id, await as(ids.malloryId), ids.oliviaId)).rejects.toBeInstanceOf(AuthzError);
      await expect(fileAsset(db, id, await as(ids.blakeId, ids.bloomId), ids.oliviaId)).rejects.toBeInstanceOf(AuthzError);
      await expect(fileAsset(db, id, await as(ids.samId), randomUUID())).rejects.toBeInstanceOf(AuthzError);
      expect((await row(id)).childSubjectId).toBeNull();
    });

    it('a keepsake the viewer can’t see is “not found” to them (Rosie can’t file Sam’s only-me one)', async () => {
      const id = await kept(ids.samId, 'ONLY_ME');
      await expect(fileAsset(db, id, await as(ids.rosieId), ids.oliviaId)).rejects.toThrow(/not found/);
    });
  });
});
