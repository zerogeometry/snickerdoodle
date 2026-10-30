import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { accounts, assets, children, pendingKeeps } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { finishPendingKeeps, keepAndFileCreations, keepUpload, purgeExpiredPendingKeeps, rememberKeepForEmail } from '@/server/keepsakes';
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

  describe('04-B3: a relative with "view, buy & add" keeps into the family they JOINED', () => {
    const extraFamilies: string[] = [];
    afterAll(async () => {
      // the own box a VIEW_BUY relative keeps into (created on first use) — cleared before the seed goes
      const own = await db.select({ id: schema.families.id }).from(schema.families).where(inArray(schema.families.ownerAccountId, [ids.joId, ids.rosieId]));
      const famIds = [...new Set([...own.map((f) => f.id), ...extraFamilies])];
      if (famIds.length) {
        await db.delete(assets).where(inArray(assets.familyId, famIds));
        await db.delete(schema.memberships).where(inArray(schema.memberships.familyId, famIds));
        await db.delete(schema.families).where(inArray(schema.families.id, famIds));
      }
    });

    it('a CONTRIBUTE second parent’s "+ keepsake" lands in the joined family, where the parent sees it', async () => {
      const a = await draft();
      expect(await keepUpload(db, { id: ids.joId, name: 'Jo' }, [a.claimId], a.assetId)).toBe(true);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect([row!.familyId, row!.keptInHome, row!.visibility]).toEqual([ids.hartleyId, true, 'FAMILY']);
    });

    it('…but never ADDS a little one to someone else’s family — only an existing one is filed under', async () => {
      const a = await draft();
      const name = `Zed${randomUUID().slice(0, 4)}`.replace(/[^A-Za-z]/g, '') || 'Zed';
      await keepAndFileCreations(db, { id: ids.joId, name: 'Jo' }, [a.claimId], [a.assetId], name);
      expect(await db.select().from(children).where(eq(children.familyId, ids.hartleyId)).then((c) => c.some((x) => x.firstName.toLowerCase() === name.toLowerCase()))).toBe(false);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect(row!.familyId).toBe(ids.hartleyId);
      expect(row!.childSubjectId).toBeNull();
      // an EXISTING little one: filed under them, and their controlling parent becomes the controller
      const b = await draft();
      const [olivia] = await db.select().from(children).where(eq(children.id, ids.oliviaId));
      await keepAndFileCreations(db, { id: ids.joId, name: 'Jo' }, [b.claimId], [b.assetId], olivia!.firstName);
      const [filed] = await db.select().from(assets).where(eq(assets.id, b.assetId));
      expect([filed!.childSubjectId, filed!.controllerAccountId]).toEqual([ids.oliviaId, olivia!.controllerAccountId]);
    });

    it('a VIEW_BUY relative (look + buy, not add) keeps into their OWN box, never the family’s', async () => {
      const a = await draft();
      expect(await keepUpload(db, { id: ids.rosieId, name: 'Rosie' }, [a.claimId], a.assetId)).toBe(true);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect(row!.familyId).not.toBe(ids.hartleyId);
      const [fam] = await db.select().from(schema.families).where(eq(schema.families.id, row!.familyId!));
      expect(fam!.ownerAccountId).toBe(ids.rosieId);
    });
  });

  describe('a guest’s "+ keepsake", finished after they sign in (same browser only)', () => {
    const samAccount = async () => {
      const [a] = await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.id, ids.samId));
      return { id: ids.samId, name: 'Sam', email: a!.email! };
    };

    it('remembered at sign-in (claim-checked, email hashed), kept once that person signs in', async () => {
      const a = await draft();
      const sam = await samAccount();
      expect(await rememberKeepForEmail(db, { assetId: a.assetId, email: `  ${sam.email.toUpperCase()} `, uploadClaims: [a.claimId] })).toBe(true);
      const [req] = await db.select().from(pendingKeeps).where(eq(pendingKeeps.assetId, a.assetId));
      expect(req!.emailHash).not.toContain('@'); // never the address itself
      // signed in, but in a browser WITHOUT the drawing's claim: nothing is kept (07-B5), and the
      // request waits in case they come back in the browser that made it
      expect(await finishPendingKeeps(db, sam, [])).toEqual([]);
      expect(await finishPendingKeeps(db, sam, ['00000000-0000-4000-8000-000000000000', 'not-a-uuid'])).toEqual([]);
      expect(await db.select().from(pendingKeeps).where(eq(pendingKeeps.assetId, a.assetId))).toHaveLength(1);
      // back in the browser that uploaded it and asked: kept
      expect(await finishPendingKeeps(db, sam, [a.claimId])).toEqual([a.assetId]);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect([row!.controllerAccountId, row!.keptInHome, row!.purgeAfter]).toEqual([ids.samId, true, null]);
      expect(await db.select().from(pendingKeeps).where(eq(pendingKeeps.assetId, a.assetId))).toHaveLength(0);
    });

    it('only the uploader can ask: without the draft’s claim nothing is remembered', async () => {
      const a = await draft();
      expect(await rememberKeepForEmail(db, { assetId: a.assetId, email: 'someone@example.com', uploadClaims: ['not-the-claim'] })).toBe(false);
      expect(await db.select().from(pendingKeeps).where(eq(pendingKeeps.assetId, a.assetId))).toHaveLength(0);
    });

    it('a different person signing in keeps nothing', async () => {
      const a = await draft();
      await rememberKeepForEmail(db, { assetId: a.assetId, email: 'grandma@example.com', uploadClaims: [a.claimId] });
      expect(await finishPendingKeeps(db, await samAccount(), [a.claimId])).toEqual([]);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect(row!.keptInHome).toBe(false);
      await db.delete(pendingKeeps).where(eq(pendingKeeps.assetId, a.assetId));
    });

    it('a request nobody came back for expires: not kept, and cleaned up', async () => {
      const a = await draft();
      const sam = await samAccount();
      const then = new Date(Date.now() - 2 * 86_400_000);
      await rememberKeepForEmail(db, { assetId: a.assetId, email: sam.email, uploadClaims: [a.claimId], now: then });
      expect(await purgeExpiredPendingKeeps(db)).toBeGreaterThanOrEqual(1);
      expect(await finishPendingKeeps(db, sam, [a.claimId])).toEqual([]);
      const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
      expect(row!.keptInHome).toBe(false);
    });
  });
});
