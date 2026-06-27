import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { cleanupDemoFamilies, seedDemoFamilies, type SeededIds } from '@/db/seed';
import { resolveChildSubject } from '@/server/children';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

describe.skipIf(!DB)('resolveChildSubject — find or create a keepsake subject', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  let ids: SeededIds;

  beforeAll(async () => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
    ids = await seedDemoFamilies(db);
  });

  afterAll(async () => {
    if (ids) await cleanupDemoFamilies(db, ids); // cascades children created in the family
    await client.end();
  });

  it('finds an existing child case-insensitively (never duplicates)', async () => {
    const a = await resolveChildSubject(db, ids.hartleyId, ids.samId, 'Olivia');
    const b = await resolveChildSubject(db, ids.hartleyId, ids.samId, 'olivia');
    expect(a?.id).toBe(ids.oliviaId);
    expect(b?.id).toBe(ids.oliviaId);
    expect(a?.controllerAccountId).toBe(ids.samId);
  });

  it('creates a new child controlled by the calling parent, idempotently', async () => {
    const c = await resolveChildSubject(db, ids.hartleyId, ids.samId, 'Wishbert');
    expect(c?.id).toBeTruthy();
    expect(c?.firstName).toBe('Wishbert');
    expect(c?.controllerAccountId).toBe(ids.samId); // parent is controller; child is a subject, not an account
    const again = await resolveChildSubject(db, ids.hartleyId, ids.samId, 'wishbert');
    expect(again?.id).toBe(c?.id); // same little one, not a duplicate
  });

  it('returns null for an unusable name (surname / empty)', async () => {
    expect(await resolveChildSubject(db, ids.hartleyId, ids.samId, 'Mia Smith')).toBeNull();
    expect(await resolveChildSubject(db, ids.hartleyId, ids.samId, '')).toBeNull();
    expect(await resolveChildSubject(db, ids.hartleyId, ids.samId, '   ')).toBeNull();
  });
});
