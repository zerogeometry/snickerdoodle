import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, children } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { keepAndFileCreations, keepUpload } from '@/server/keepsakes';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/**
 * The keepsake-save folded into checkout: adopt the ephemeral basket draft into the
 * family + file it under the child. Touches ownership + visibility, so it ships with
 * tests (CLAUDE.md). Drafts are inserted directly (no storage needed for these checks).
 */
describe.skipIf(!DB)('keepAndFileCreations — keep + file under child (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const draftIds: string[] = [];

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (ids) {
      if (draftIds.length) await db.delete(assets).where(inArray(assets.id, draftIds));
      await cleanupDemoFamilies(db, ids); // cascades children created during the test
    }
    await client.end();
  });

  const sam = () => ({ id: ids.samId, name: 'Sam' });

  async function draft(moderationStatus: 'CLEAR' | 'FLAGGED' | 'BLOCKED' = 'CLEAR') {
    const assetId = randomUUID();
    const claimId = randomUUID();
    draftIds.push(assetId);
    await db.insert(assets).values({
      id: assetId,
      familyId: null,
      kind: 'DRAWING',
      uploaderAccountId: null,
      controllerAccountId: null,
      ephemeralClaimId: claimId,
      visibility: 'FAMILY',
      moderationStatus,
      keptInHome: false,
      purgeAfter: new Date(Date.now() + 30 * 86_400_000),
      termsAcceptedAt: new Date(),
      termsVersion: 'test-v1',
    });
    return { assetId, claimId };
  }

  it('keeps the creation and files it under the named child', async () => {
    const a = await draft();
    const { familyId, childId } = await keepAndFileCreations(db, sam(), [a.claimId], [a.assetId], 'Maya');
    expect(familyId).toBe(ids.hartleyId);
    expect(childId).toBeTruthy();

    const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
    expect(row!.familyId).toBe(ids.hartleyId);
    expect(row!.keptInHome).toBe(true); // kept (off the retention clock)
    expect(row!.purgeAfter).toBeNull();
    expect(row!.controllerAccountId).toBe(ids.samId); // the child's controlling parent
    expect(row!.childSubjectId).toBe(childId);

    const [kid] = await db.select().from(children).where(eq(children.id, childId!));
    expect(kid!.firstName).toBe('Maya');
    expect(kid!.familyId).toBe(ids.hartleyId);
  });

  it('keeps but leaves unfiled when there is no subject', async () => {
    const a = await draft();
    const { childId } = await keepAndFileCreations(db, sam(), [a.claimId], [a.assetId]);
    expect(childId).toBeNull();
    const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
    expect(row!.keptInHome).toBe(true);
    expect(row!.childSubjectId).toBeNull();
  });

  it('keeps but NEVER stores a surname — unfiled on a bad name', async () => {
    const a = await draft();
    const { childId } = await keepAndFileCreations(db, sam(), [a.claimId], [a.assetId], 'Maya Smith');
    expect(childId).toBeNull(); // surname rejected → not filed
    const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
    expect(row!.keptInHome).toBe(true); // the order still keeps the creation
    expect(row!.childSubjectId).toBeNull();
  });

  it('skips a draft the caller does not hold the claim for', async () => {
    const mine = await draft();
    const notMine = await draft();
    await keepAndFileCreations(db, sam(), [mine.claimId], [mine.assetId, notMine.assetId], 'Maya');
    const [nm] = await db.select().from(assets).where(eq(assets.id, notMine.assetId));
    expect(nm!.familyId).toBeNull(); // never adopted
    expect(nm!.keptInHome).toBe(false);
    expect(nm!.ephemeralClaimId).toBe(notMine.claimId);
  });

  describe('"+ keepsake" on the range — keep the drawing already uploaded', () => {
    it('a guest draft with its claim is adopted and kept, off the retention clock', async () => {
      const a = await draft();
      expect(await keepUpload(db, sam(), [a.claimId], a.assetId)).toBe(true);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect([row!.familyId, row!.controllerAccountId, row!.keptInHome, row!.purgeAfter]).toEqual([ids.hartleyId, ids.samId, true, null]);
    });

    it('their own not-yet-kept upload (filed for an order) is simply marked kept', async () => {
      const a = await draft();
      await keepAndFileCreations(db, sam(), [a.claimId], [a.assetId], null, { keep: false });
      expect(await keepUpload(db, sam(), [], a.assetId)).toBe(true);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect([row!.keptInHome, row!.purgeAfter]).toEqual([true, null]);
    });

    it('without the claim, someone else’s draft can’t be kept — and stays on the clock', async () => {
      const a = await draft();
      expect(await keepUpload(db, sam(), [], a.assetId)).toBe(false);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect([row!.familyId, row!.keptInHome]).toEqual([null, false]);
      expect(row!.purgeAfter).not.toBeNull();
    });
  });
});
