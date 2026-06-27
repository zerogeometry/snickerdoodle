import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { getGiftLink } from '@/server/giftLinks';
import { mintWish } from '@/server/wish';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

/**
 * Share a Wish composes adoption (keep) + gift-link minting — a change that touches
 * OWNERSHIP, VISIBILITY and CONTENT-SAFETY, so it must be tested (CLAUDE.md). These
 * exercise the real server core against Postgres; the drafts are inserted directly
 * (no storage needed — createGiftLink snapshots from the asset rows).
 */
describe.skipIf(!DB)('mint a wish — keep then share (integration)', () => {
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
      await db.delete(giftLinks).where(eq(giftLinks.familyId, ids.hartleyId));
      if (draftIds.length) await db.delete(assets).where(inArray(assets.id, draftIds));
      await cleanupDemoFamilies(db, ids);
    }
    await client.end();
  });

  const sam = () => ({ id: ids.samId, name: 'Sam' });
  const tokenOf = (url?: string) => (url ?? '').replace('/g/', '');

  // An ephemeral guest draft (claim-gated, no family/account) at a chosen moderation
  // status. Inserted directly — createGiftLink freezes from the asset row, so no
  // storage object is required for these assertions.
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

  it('keeps each CLEAR draft into the family and mints a link from them', async () => {
    const a = await draft('CLEAR');
    const b = await draft('CLEAR');

    const res = await mintWish(db, sam(), [a.claimId, b.claimId], { assetIds: [a.assetId, b.assetId] });
    expect(res.ok).toBe(true);
    expect(res.url).toMatch(/^\/g\//);

    for (const d of [a, b]) {
      const [row] = await db.select().from(assets).where(eq(assets.id, d.assetId));
      expect(row!.familyId).toBe(ids.hartleyId); // filed into Sam's family
      expect(row!.controllerAccountId).toBe(ids.samId); // controller resolved
      expect(row!.keptInHome).toBe(true); // kept (the keepsake-save fold-in)
      expect(row!.ephemeralClaimId).toBeNull(); // single-use claim retired
      expect(row!.purgeAfter).toBeNull(); // off the retention clock
      expect(row!.visibility).toBe('FAMILY'); // privacy-by-default preserved
    }

    const view = await getGiftLink(db, tokenOf(res.url));
    expect(view.state).toBe('active');
    if (view.state === 'active') expect(view.items).toHaveLength(2);
  });

  it('excludes a FLAGGED creation from the shared link (CLEAR-only) even though it is kept for review', async () => {
    const clear = await draft('CLEAR');
    const flagged = await draft('FLAGGED');

    const res = await mintWish(db, sam(), [clear.claimId, flagged.claimId], { assetIds: [clear.assetId, flagged.assetId] });
    expect(res.ok).toBe(true);

    const view = await getGiftLink(db, tokenOf(res.url));
    expect(view.state).toBe('active');
    if (view.state === 'active') {
      expect(view.items).toHaveLength(1);
      expect(view.items[0]!.assetId).toBe(clear.assetId);
    }

    // the flagged one is still kept in the family (in review) — just never shared out
    const [f] = await db.select().from(assets).where(eq(assets.id, flagged.assetId));
    expect(f!.keptInHome).toBe(true);
    expect(f!.familyId).toBe(ids.hartleyId);
  });

  it('a BLOCKED creation is never kept nor shared; an all-blocked wish fails', async () => {
    const blocked = await draft('BLOCKED');

    const res = await mintWish(db, sam(), [blocked.claimId], { assetIds: [blocked.assetId] });
    expect(res.ok).toBe(false); // nothing shareable → no link

    const [row] = await db.select().from(assets).where(eq(assets.id, blocked.assetId));
    expect(row!.keptInHome).toBe(false); // adoption refused (D8) — never filed
    expect(row!.familyId).toBeNull();
    expect(row!.ephemeralClaimId).toBe(blocked.claimId);
  });

  it('a draft whose claim the caller does NOT hold is never kept or shared', async () => {
    const mine = await draft('CLEAR');
    const notMine = await draft('CLEAR');

    // only hold `mine`'s claim — `notMine` belongs to some other guest session
    const res = await mintWish(db, sam(), [mine.claimId], { assetIds: [mine.assetId, notMine.assetId] });
    expect(res.ok).toBe(true);

    const view = await getGiftLink(db, tokenOf(res.url));
    expect(view.state).toBe('active');
    if (view.state === 'active') {
      expect(view.items).toHaveLength(1);
      expect(view.items[0]!.assetId).toBe(mine.assetId);
    }

    const [nm] = await db.select().from(assets).where(eq(assets.id, notMine.assetId));
    expect(nm!.familyId).toBeNull(); // never adopted — left as someone else's draft
    expect(nm!.ephemeralClaimId).toBe(notMine.claimId);
  });

  it('dedupes repeated asset ids into a single shared item', async () => {
    const a = await draft('CLEAR');

    const res = await mintWish(db, sam(), [a.claimId], { assetIds: [a.assetId, a.assetId, a.assetId] });
    expect(res.ok).toBe(true);

    const view = await getGiftLink(db, tokenOf(res.url));
    if (view.state === 'active') expect(view.items).toHaveLength(1);
  });

  it('an empty basket cannot mint a wish', async () => {
    const res = await mintWish(db, sam(), [], { assetIds: [] });
    expect(res.ok).toBe(false);
    expect(res.url).toBeUndefined();
  });

  it('rejects a subject that contains a surname — and keeps nothing (child first name only)', async () => {
    const a = await draft('CLEAR');
    const res = await mintWish(db, sam(), [a.claimId], { assetIds: [a.assetId], subject: 'Mia Smith' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('name');
    // screened BEFORE adoption — the creation is not kept
    const [row] = await db.select().from(assets).where(eq(assets.id, a.assetId));
    expect(row!.familyId).toBeNull();
    expect(row!.keptInHome).toBe(false);
  });

  it('rejects an abusive subject', async () => {
    const a = await draft('CLEAR');
    const res = await mintWish(db, sam(), [a.claimId], { assetIds: [a.assetId], subject: 'fuckface' });
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('name');
  });

  it('a valid first name becomes the gift title', async () => {
    const a = await draft('CLEAR');
    const res = await mintWish(db, sam(), [a.claimId], { assetIds: [a.assetId], subject: 'Mia' });
    expect(res.ok).toBe(true);
    const view = await getGiftLink(db, tokenOf(res.url));
    expect(view.state).toBe('active');
    if (view.state === 'active') expect(view.title).toBe('Mia’s wishlist');
  });

  it('an all-FLAGGED wish keeps the creations for review but mints no link', async () => {
    const f1 = await draft('FLAGGED');
    const f2 = await draft('FLAGGED');
    const res = await mintWish(db, sam(), [f1.claimId, f2.claimId], { assetIds: [f1.assetId, f2.assetId] });
    expect(res.ok).toBe(false); // nothing CLEAR to share
    for (const f of [f1, f2]) {
      const [row] = await db.select().from(assets).where(eq(assets.id, f.assetId));
      expect(row!.keptInHome).toBe(true); // kept in the family, in review
      expect(row!.familyId).toBe(ids.hartleyId);
    }
  });

  it('writes a GIFT_LINK_CREATED audit record', async () => {
    const a = await draft('CLEAR');
    const res = await mintWish(db, sam(), [a.claimId], { assetIds: [a.assetId] });
    expect(res.ok).toBe(true);
    const audits = await db
      .select()
      .from(auditRecords)
      .where(and(eq(auditRecords.familyId, ids.hartleyId), eq(auditRecords.event, 'GIFT_LINK_CREATED')));
    expect(audits.length).toBeGreaterThan(0);
  });
});
