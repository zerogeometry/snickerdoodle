import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { invites, memberships } from '@/db/schema';
import type { JoinProvenance } from '@/pricing';
import { getCurrentAccount } from './session';

/**
 * Resolve the current account's join provenance for pricing — entirely from the
 * server's DB, never from the request. Eligible when the account holds an ACTIVE
 * membership that came from an invite (i.e. they joined a family, they don't own
 * it). The pure resolveJoinContext then checks the invite is VERIFIED, unrevoked
 * and still in its window — so the 5% applies during the join window and not for
 * guests or owners.
 *
 * Product note (flagged): the saving currently rides the invite's 14-day window;
 * one-time consumption at purchase lands with real orders/Stripe.
 */
export async function resolveSessionJoinProvenance(): Promise<JoinProvenance | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const db = getDb();
  const [row] = await db
    .select({ m: memberships, inv: invites })
    .from(memberships)
    .innerJoin(invites, eq(memberships.inviteId, invites.id))
    .where(
      and(
        eq(memberships.accountId, account.id),
        eq(memberships.status, 'ACTIVE'),
        eq(memberships.isOwner, false),
        isNotNull(memberships.inviteId),
      ),
    )
    .orderBy(desc(memberships.joinedAt))
    .limit(1);

  if (!row) return null;

  return {
    invite: {
      id: row.inv.id,
      familyId: row.inv.familyId,
      verified: row.inv.status === 'VERIFIED',
      revoked: row.inv.status === 'REVOKED',
      expiresAt: row.inv.expiresAt.getTime(),
    },
    membership: {
      familyId: row.m.familyId,
      status: row.m.status,
      inviteId: row.m.inviteId,
      isOwner: row.m.isOwner,
      savingConsumed: row.m.joinSavingConsumedAt !== null,
    },
    now: Date.now(),
  };
}
