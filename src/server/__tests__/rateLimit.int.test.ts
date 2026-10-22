import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { like, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/db/schema';
import { rateLimits } from '@/db/schema';
import { callerKey, purgeExpiredRateLimits, rateLimit, rateLimitAll } from '@/server/rateLimit';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;

describe.skipIf(!DB)('rate limiter — Postgres fixed windows (integration)', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const bucket = `test-${randomUUID().slice(0, 8)}`;

  beforeAll(() => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
  });
  afterAll(async () => {
    await db.delete(rateLimits).where(like(rateLimits.key, `${bucket}%`));
    await client.end();
  });

  it('allows up to the limit, then blocks with a retry time', async () => {
    const l = { bucket, caller: 'someone@example.com', limit: 3, windowSec: 60 };
    for (let i = 0; i < 3; i++) expect((await rateLimit(db, l)).ok).toBe(true);
    const blocked = await rateLimit(db, l);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  it('counts concurrent requests exactly — a burst can’t slip past the limit', async () => {
    const l = { bucket: `${bucket}-burst`, caller: '203.0.113.9', limit: 10, windowSec: 60 };
    const results = await Promise.all(Array.from({ length: 25 }, () => rateLimit(db, l)));
    expect(results.filter((r) => r.ok)).toHaveLength(10);
  });

  it('a new window starts fresh once the old one has passed', async () => {
    const l = { bucket: `${bucket}-window`, caller: 'acct-1', limit: 1, windowSec: 60 };
    expect((await rateLimit(db, l)).ok).toBe(true);
    expect((await rateLimit(db, l)).ok).toBe(false);
    // move the window into the past
    await db.update(rateLimits).set({ windowStart: sql`now() - interval '2 minutes'` }).where(sql`key = ${callerKey(l.bucket, l.caller)}`);
    expect((await rateLimit(db, l)).ok).toBe(true);
  });

  it('a costly action counts its cost (a batch of 8 previews is 8)', async () => {
    const l = { bucket: `${bucket}-cost`, caller: '198.51.100.1', limit: 10, windowSec: 60 };
    expect((await rateLimit(db, { ...l, cost: 8 })).ok).toBe(true);
    expect((await rateLimit(db, { ...l, cost: 8 })).ok).toBe(false);
  });

  it('callers are separate, and every limit in a set must pass', async () => {
    const a = { bucket: `${bucket}-all`, caller: 'a@example.com', limit: 1, windowSec: 60 };
    const ip = { bucket: `${bucket}-all-ip`, caller: '192.0.2.1', limit: 5, windowSec: 60 };
    expect((await rateLimitAll(db, [a, ip])).ok).toBe(true);
    expect((await rateLimitAll(db, [a, ip])).ok).toBe(false); // the email is spent
    expect((await rateLimitAll(db, [{ ...a, caller: 'b@example.com' }, ip])).ok).toBe(true); // another email, same IP
  });

  it('never stores the raw caller — only a keyed hash', async () => {
    const rows = await db.select().from(rateLimits).where(like(rateLimits.key, `${bucket}%`));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.key).not.toContain('@');
      expect(r.key).not.toContain('203.0.113.9');
    }
  });

  it('old windows are purged by the retention job', async () => {
    const l = { bucket: `${bucket}-old`, caller: 'old', limit: 1, windowSec: 60 };
    await rateLimit(db, l);
    await db.update(rateLimits).set({ windowStart: sql`now() - interval '2 days'` }).where(sql`key = ${callerKey(l.bucket, l.caller)}`);
    expect(await purgeExpiredRateLimits(db)).toBeGreaterThanOrEqual(1);
    const left = await db.select().from(rateLimits).where(sql`key = ${callerKey(l.bucket, l.caller)}`);
    expect(left).toHaveLength(0);
  });

  it('fails OPEN by default and CLOSED when asked, if the database is unreachable', async () => {
    const dead = postgres('postgres://nobody:nothing@127.0.0.1:1/none', { prepare: false, connect_timeout: 1 });
    const deadDb = drizzle(dead, { schema }) as unknown as DbHandle;
    expect((await rateLimit(deadDb, { bucket, caller: 'x', limit: 1, windowSec: 60 })).ok).toBe(true);
    expect((await rateLimit(deadDb, { bucket, caller: 'x', limit: 1, windowSec: 60, failClosed: true })).ok).toBe(false);
    await dead.end({ timeout: 0 }).catch(() => {});
  });
});
