import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { auditRecords } from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { AuthzError } from '@/authz';
import {
  changeAssetVisibility,
  getAssetDownloadGrant,
  getViewableAssetOrThrow,
  listViewableAssets,
  resolveViewerContext,
} from '@/server/assets';
import type { DbHandle } from '@/server/db';

/**
 * Integration tests: the data layer against a REAL Postgres. They prove the #1
 * engineering rule — every asset read passes through src/authz; nothing bypasses
 * it — holds against actual rows (tier × circle × controller × removed-member ×
 * cross-family). Skipped automatically when DATABASE_URL is absent (so the pure
 * suites still run anywhere); run locally with the dev DB up:
 *   DATABASE_URL=… npx vitest run src/server
 */
const URL = process.env.DATABASE_URL;

describe.skipIf(!URL)('asset data layer (authz-gated) — integration', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(URL!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids);
    await client.end();
  });

  // viewer helpers, each resolving membership in the relevant family
  const sam = () => resolveViewerContext(db, ids.samId, ids.hartleyId);
  const jo = () => resolveViewerContext(db, ids.joId, ids.hartleyId);
  const rosie = () => resolveViewerContext(db, ids.rosieId, ids.hartleyId);
  const mallory = () => resolveViewerContext(db, ids.malloryId, ids.hartleyId);
  const guest = () => resolveViewerContext(db, null, ids.hartleyId);

  describe('listViewableAssets — tier × circle', () => {
    it('owner/controller (Sam) sees all four Hartley assets', async () => {
      const seen = await listViewableAssets(db, ids.hartleyId, await sam());
      expect(new Set(seen.map((a) => a.id))).toEqual(
        new Set([ids.assetFamily, ids.assetExtended, ids.assetOnlyMe, ids.assetJoFamily]),
      );
    });

    it('Family-circle parent (Jo) sees FAMILY + EXTENDED + her own, but NOT Sam’s ONLY_ME', async () => {
      const seen = await listViewableAssets(db, ids.hartleyId, await jo());
      const seenIds = new Set(seen.map((a) => a.id));
      expect(seenIds).toEqual(new Set([ids.assetFamily, ids.assetExtended, ids.assetJoFamily]));
      expect(seenIds.has(ids.assetOnlyMe)).toBe(false);
    });

    it('Extended-circle grandparent (Rosie) sees ONLY the EXTENDED asset', async () => {
      const seen = await listViewableAssets(db, ids.hartleyId, await rosie());
      expect(seen.map((a) => a.id)).toEqual([ids.assetExtended]);
    });

    it('a REMOVED member (Mallory) sees nothing — revocation is immediate', async () => {
      const seen = await listViewableAssets(db, ids.hartleyId, await mallory());
      expect(seen).toEqual([]);
    });

    it('a guest sees nothing', async () => {
      const seen = await listViewableAssets(db, ids.hartleyId, await guest());
      expect(seen).toEqual([]);
    });
  });

  describe('cross-family isolation', () => {
    it('Sam cannot list the Blooms’ family assets', async () => {
      const samInBloom = await resolveViewerContext(db, ids.samId, ids.bloomId);
      const seen = await listViewableAssets(db, ids.bloomId, samInBloom);
      expect(seen).toEqual([]);
    });

    it('Sam cannot fetch a Bloom asset by id (denied, indistinguishable from not-found)', async () => {
      const samInBloom = await resolveViewerContext(db, ids.samId, ids.bloomId);
      await expect(getViewableAssetOrThrow(db, ids.assetBloomFamily, samInBloom)).rejects.toBeInstanceOf(AuthzError);
    });
  });

  describe('signed-url grant is gated by the same policy', () => {
    it('allows the controller', async () => {
      const grant = await getAssetDownloadGrant(db, ids.assetOnlyMe, await sam());
      expect(grant.url).toContain(ids.assetOnlyMe);
    });
    it('denies an Extended member for a FAMILY asset', async () => {
      await expect(getAssetDownloadGrant(db, ids.assetFamily, await rosie())).rejects.toBeInstanceOf(AuthzError);
    });
    it('denies a removed member', async () => {
      await expect(getAssetDownloadGrant(db, ids.assetExtended, await mallory())).rejects.toBeInstanceOf(AuthzError);
    });
  });

  describe('changeAssetVisibility — controller only, audited', () => {
    it('the controller (Sam) can widen FAMILY → EXTENDED and an audit row is written', async () => {
      const updated = await changeAssetVisibility(db, ids.assetFamily, await sam(), 'EXTENDED');
      expect(updated.visibility).toBe('EXTENDED');

      const log = await db
        .select()
        .from(auditRecords)
        .where(and(eq(auditRecords.targetId, ids.assetFamily), eq(auditRecords.event, 'ASSET_VISIBILITY_CHANGED')));
      expect(log.length).toBeGreaterThanOrEqual(1);

      // put it back so other assertions about Sam's set stay valid if reordered
      await changeAssetVisibility(db, ids.assetFamily, await sam(), 'FAMILY');
    });

    it('a non-controller (Jo) cannot change Sam’s asset visibility', async () => {
      await expect(changeAssetVisibility(db, ids.assetOnlyMe, await jo(), 'EXTENDED')).rejects.toBeInstanceOf(AuthzError);
    });

    it('an Extended member (Rosie) cannot change visibility', async () => {
      await expect(changeAssetVisibility(db, ids.assetExtended, await rosie(), 'FAMILY')).rejects.toBeInstanceOf(AuthzError);
    });
  });

  describe('resolveViewerContext', () => {
    it('resolves Sam’s ACTIVE owner membership', async () => {
      const ctx = await sam();
      expect(ctx.membership?.status).toBe('ACTIVE');
      expect(ctx.membership?.isOwner).toBe(true);
    });
    it('resolves Mallory’s membership as REMOVED (so the policy denies)', async () => {
      const ctx = await mallory();
      expect(ctx.membership?.status).toBe('REMOVED');
    });
  });
});
