import { afterAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { rateLimits } from '@/db/schema';
import { getDb } from '@/db/client';
import { callerKey } from '@/server/rateLimit';
import { spendTotpStep } from '@/server/admin/totpReplay';

/** 07-B15 / 08-B9: an admin two-step code works once — never replayed inside its 30-second window. */
describe.skipIf(!process.env.DATABASE_URL)('admin two-step: each code works once (integration)', () => {
  const db = getDb() as unknown as import('@/server/db').DbHandle;
  const admin = randomUUID();
  const other = randomUUID();
  const step = Math.floor(Date.now() / 30_000);

  afterAll(async () => {
    const keys = [admin, other].flatMap((a) => [-2, -1, 0, 1, 2].map((d) => callerKey('mfa-used', `${a}:${step + d}`)));
    await db.delete(rateLimits).where(inArray(rateLimits.key, keys));
  });

  it('the first use spends it; the same code again (another device, same window) is refused', async () => {
    expect(await spendTotpStep(db, admin, step)).toBe(true);
    expect(await spendTotpStep(db, admin, step)).toBe(false);
  });

  it('an older code can’t be used after a newer one; the next one still works', async () => {
    expect(await spendTotpStep(db, admin, step - 1)).toBe(false);
    expect(await spendTotpStep(db, admin, step + 1)).toBe(true);
  });

  it('one admin spending a step never spends it for another', async () => {
    expect(await spendTotpStep(db, other, step)).toBe(true);
  });

  it('two requests racing with the same code: exactly one wins', async () => {
    const results = await Promise.all([spendTotpStep(db, admin, step + 2), spendTotpStep(db, admin, step + 2)]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});
