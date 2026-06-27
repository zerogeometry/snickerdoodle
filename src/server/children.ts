import { and, eq, sql } from 'drizzle-orm';
import { children } from '@/db/schema';
import { screenChildFirstName } from '@/server/textSafety';
import type { DbHandle } from './db';

export interface ChildSubject {
  id: string;
  controllerAccountId: string;
  firstName: string;
}

/**
 * Find-or-create the child a keepsake is FOR, by FIRST NAME within a family. The
 * name is screened (first-name-only, no surname, no abuse) — an unusable or empty
 * name yields null (no subject). Matching is case-insensitive so "mia" and "Mia"
 * are the same little one.
 *
 * A newly-created child's controller is the calling parent: children are keepsake
 * SUBJECTS, never account holders (the parent-is-controller / no-self-join rule).
 */
export async function resolveChildSubject(
  db: DbHandle,
  familyId: string,
  accountId: string,
  rawFirstName: string | null | undefined,
): Promise<ChildSubject | null> {
  const screened = screenChildFirstName(rawFirstName);
  if (!screened.ok || !screened.value) return null;
  const firstName = screened.value;

  const [existing] = await db
    .select({ id: children.id, controllerAccountId: children.controllerAccountId, firstName: children.firstName })
    .from(children)
    .where(and(eq(children.familyId, familyId), sql`lower(${children.firstName}) = lower(${firstName})`));
  if (existing) return existing;

  const [created] = await db
    .insert(children)
    .values({ familyId, firstName, controllerAccountId: accountId })
    .returning({ id: children.id, controllerAccountId: children.controllerAccountId, firstName: children.firstName });
  return created!;
}
