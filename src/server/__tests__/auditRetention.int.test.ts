import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { randomUUID } from 'node:crypto';
import * as schema from '@/db/schema';
import { auditRecords } from '@/db/schema';
import { AUDIT_RETENTION_YEARS, purgeExpiredAuditRecords } from '@/server/retention';
import type { DbHandle } from '@/server/db';

const DB = process.env.DATABASE_URL;
/** The DB's own refusal (drizzle wraps it; the trigger's message is on the cause). */
async function refused(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'allowed';
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    return `${err.message ?? ''} ${err.cause?.message ?? ''}`;
  }
}
const yearsAgo = (n: number) => new Date(Date.now() - n * 365.25 * 86_400_000);

/** The audit trail is append-only, with one narrow exception: rows past the 6-year retention
 * period, deleted by the retention job's opted-in transaction. */
describe.skipIf(!DB)('audit trail retention', () => {
  let client: ReturnType<typeof postgres>;
  let db: DbHandle;
  const tag = randomUUID();

  beforeAll(() => {
    client = postgres(DB!, { prepare: false });
    db = drizzle(client, { schema });
  });
  afterAll(async () => {
    await client.end();
  });

  const insert = async (createdAt: Date) =>
    (await db.insert(auditRecords).values({ actorType: 'SYSTEM', event: 'PURGE_EXECUTED', targetType: 'test', targetId: tag, createdAt }).returning({ id: auditRecords.id }))[0]!.id;

  it('still refuses any update, and any delete without the purge opt-in', async () => {
    const id = await insert(yearsAgo(AUDIT_RETENTION_YEARS + 1));
    expect(await refused(db.update(auditRecords).set({ targetType: 'x' }).where(eq(auditRecords.id, id)))).toMatch(/append-only/);
    expect(await refused(db.delete(auditRecords).where(eq(auditRecords.id, id)))).toMatch(/append-only/);
  });

  it('even with the opt-in, a row younger than the retention period cannot be deleted', async () => {
    const id = await insert(yearsAgo(1));
    expect(
      await refused(
        db.transaction(async (tx) => {
          await tx.execute(sql`select set_config('snickerdoodle.audit_purge', 'on', true)`);
          await tx.delete(auditRecords).where(eq(auditRecords.id, id));
        }),
      ),
    ).toMatch(/append-only/);
  });

  it('the retention job removes rows past 6 years and keeps the rest', async () => {
    const old = await insert(yearsAgo(AUDIT_RETENTION_YEARS + 0.5));
    const recent = await insert(yearsAgo(AUDIT_RETENTION_YEARS - 0.5));
    const res = await purgeExpiredAuditRecords(db);
    expect(res.purged).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(auditRecords).where(eq(auditRecords.id, old))).toHaveLength(0);
    expect(await db.select().from(auditRecords).where(eq(auditRecords.id, recent))).toHaveLength(1);
  });
});
