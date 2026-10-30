import { sql } from 'drizzle-orm';
import type { DbHandle } from '@/server/db';

/**
 * TEST-ONLY: run a test that drives a GLOBAL job (runReminders sends for every family in the database)
 * while no other suite's such test is running. The integration suites share one database and run in
 * parallel, so another suite's runReminders could send THIS test's reminders first (recording them as
 * sent) and this test's own run would find nothing left. The lock is a Postgres transaction-level
 * advisory lock held for the whole body (setup, run, asserts); the body itself uses `db` as usual.
 */
const GLOBAL_JOBS_LOCK = 0x5d_e2e_10b;

export function exclusively<T>(db: DbHandle, body: () => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${GLOBAL_JOBS_LOCK})`);
    return body();
  });
}
