import { and, eq } from 'drizzle-orm';
import { families, memberships } from '@/db/schema';
import type { DbHandle } from './db';

/**
 * Every account is the controller of its own family workspace. On first use we
 * create it and make the account the owner (an ACTIVE, CONTRIBUTE, Family-circle
 * membership). Idempotent: returns the existing family if there already is one.
 *
 * This is the "parent is controller / no self-join" model — the owner's
 * membership is the only one created without an invite (the schema CHECK allows
 * it precisely for owners).
 */
export async function ensureHomeFamily(
  db: DbHandle,
  accountId: string,
  displayName: string | null,
): Promise<string> {
  const existing = await db
    .select({ familyId: memberships.familyId })
    .from(memberships)
    .where(and(eq(memberships.accountId, accountId), eq(memberships.isOwner, true), eq(memberships.status, 'ACTIVE')));
  if (existing[0]) return existing[0].familyId;

  const name = displayName?.trim() ? `${displayName.trim()}'s family` : 'Your family';
  const [family] = await db.insert(families).values({ displayName: name, ownerAccountId: accountId }).returning();
  await db.insert(memberships).values({
    familyId: family!.id,
    accountId,
    relationship: 'PARENT',
    circle: 'FAMILY',
    accessLevel: 'CONTRIBUTE',
    status: 'ACTIVE',
    isOwner: true,
  });
  return family!.id;
}
