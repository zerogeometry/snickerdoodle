import 'server-only';
import { rateLimits } from '@/db/schema';
import type { DbHandle } from '../db';
import { callerKey } from '../rateLimit';

/**
 * A two-step code works ONCE (07-B15 / 08-B9): without this, a code seen over a shoulder or on a
 * shared screen could be replayed on another device inside its 30-second window. Spending a step
 * marks it — and the step before it, so an older code can't be used after a newer one — in the
 * rate-limit table we already run (hashed key, purged a day on by the retention job; no new table).
 * True only for the one request that spends it first.
 */
export async function spendTotpStep(db: DbHandle, accountId: string, step: number): Promise<boolean> {
  const mark = (s: number) =>
    db
      .insert(rateLimits)
      .values({ key: callerKey('mfa-used', `${accountId}:${s}`), windowStart: new Date(), count: 1 })
      .onConflictDoNothing({ target: rateLimits.key })
      .returning({ key: rateLimits.key });
  const [spent] = await mark(step);
  if (!spent) return false;
  await mark(step - 1);
  return true;
}
