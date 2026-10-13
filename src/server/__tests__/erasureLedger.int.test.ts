import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import sharp from 'sharp';
import * as schema from '@/db/schema';
import { assets, children, memberships } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { deleteAsset, resolveViewerContext } from '@/server/assets';
import { addChild, deleteChild } from '@/server/children';
import { listErasuresSince, reapplyErasuresSince } from '@/server/erasureLedger';
import { ingestOriginalAsset } from '@/server/ingest';
import { removeMember } from '@/server/members';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
const S3 = process.env.S3_ENDPOINT;
const png = () => sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 7, g: 7, b: 7 } } }).png().toBuffer();

/**
 * A restore drill: erasures are recorded outside the database, so after a backup restore brings
 * deleted rows back, replaying the ledger deletes them again.
 */
describe.skipIf(!DB || !S3)('erasure ledger — nothing deleted comes back after a restore', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;
  const since = new Date(Date.now() - 1000);

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });
  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  it('records erasures (ids only) and replays them after a simulated restore', async () => {
    const sam = await resolveViewerContext(db, ids.samId, ids.hartleyId);

    // 1. real erasures
    const art = await ingestOriginalAsset(db, sam, { familyId: ids.hartleyId, kind: 'DRAWING', buffer: await png(), keptInHome: true });
    const [assetRowBefore] = await db.select().from(assets).where(eq(assets.id, art.assetId));
    await deleteAsset(db, art.assetId, sam);
    const added = await addChild(db, sam, { familyId: ids.hartleyId, firstName: 'Bramble' });
    if (!added.ok) throw new Error('addChild');
    const [childBefore] = await db.select().from(children).where(eq(children.id, added.child.id));
    await deleteChild(db, sam, { familyId: ids.hartleyId, childId: added.child.id, alsoDeleteKeepsakes: false });
    await removeMember(db, sam, { familyId: ids.hartleyId, memberAccountId: ids.rosieId });

    const ledger = await listErasuresSince(since);
    expect(ledger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'asset', id: art.assetId }),
        expect.objectContaining({ kind: 'child', id: added.child.id }),
        expect.objectContaining({ kind: 'membership', accountId: ids.rosieId, status: 'REMOVED' }),
      ]),
    );
    expect(JSON.stringify(ledger)).not.toContain('Bramble'); // ids only — never names

    // 2. "restore": the old rows come back from the backup
    await db.insert(assets).values(assetRowBefore!);
    await db.insert(children).values(childBefore!);
    await db.update(memberships).set({ status: 'ACTIVE', revokedAt: null }).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.rosieId)));

    // 3. replay → gone again
    const res = await reapplyErasuresSince(db, since);
    expect(res.failed.filter((f) => [art.assetId, added.child.id, ids.rosieId].some((x) => JSON.stringify(f.entry).includes(x)))).toEqual([]);
    expect(await db.select().from(assets).where(eq(assets.id, art.assetId))).toHaveLength(0);
    expect(await db.select().from(children).where(eq(children.id, added.child.id))).toHaveLength(0);
    const [rosie] = await db.select().from(memberships).where(and(eq(memberships.familyId, ids.hartleyId), eq(memberships.accountId, ids.rosieId)));
    expect(rosie!.status).toBe('REMOVED');

    // 4. idempotent
    const again = await reapplyErasuresSince(db, since);
    expect(again.reapplied).toBe(0);
  });
});
