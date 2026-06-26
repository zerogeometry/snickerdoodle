import { and, desc, eq } from 'drizzle-orm';
import { canViewAsset, type AssetRef } from '@/authz';
import { accounts, assets, families, memberships, storageObjects } from '@/db/schema';
import { getDb } from '@/db/client';
import { presignDownload } from '@/storage';
import type { Circle, VisibilityTier } from '@/domain/types';
import { ensureHomeFamily } from './onboarding';
import { resolveViewerContext } from './assets';
import { getCurrentAccount } from './session';

export interface HomeMember {
  accountId: string;
  name: string;
  initial: string;
  circle: Circle;
  isOwner: boolean;
  isYou: boolean;
}

export interface HomeKeepsake {
  id: string;
  visibility: VisibilityTier;
  createdAtISO: string;
  imageUrl: string | null;
}

export interface HomeData {
  account: { id: string; email: string; name: string | null };
  familyId: string;
  familyName: string;
  members: HomeMember[];
  keepsakes: HomeKeepsake[];
}

function refOf(row: typeof assets.$inferSelect): AssetRef {
  return {
    id: row.id,
    familyId: row.familyId,
    uploaderAccountId: row.uploaderAccountId,
    controllerAccountId: row.controllerAccountId,
    visibility: row.visibility,
  };
}

/** Everything the keepsake home needs for the signed-in account — null for a guest. */
export async function loadHome(): Promise<HomeData | null> {
  const account = await getCurrentAccount();
  if (!account) return null;

  const db = getDb();
  const familyId = await ensureHomeFamily(db, account.id, account.name);

  const [family] = await db.select().from(families).where(eq(families.id, familyId));

  const memberRows = await db
    .select({ m: memberships, a: accounts })
    .from(memberships)
    .innerJoin(accounts, eq(memberships.accountId, accounts.id))
    .where(and(eq(memberships.familyId, familyId), eq(memberships.status, 'ACTIVE')));

  const members: HomeMember[] = memberRows.map(({ m, a }) => {
    const name = a.displayName ?? a.email.split('@')[0] ?? 'Member';
    return {
      accountId: a.id,
      name,
      initial: name.charAt(0).toUpperCase(),
      circle: m.circle,
      isOwner: m.isOwner,
      isYou: a.id === account.id,
    };
  });

  const viewer = await resolveViewerContext(db, account.id, familyId);

  // Kept keepsakes (the home is the keepsake box), newest first, with their
  // preserved ORIGINAL's key for thumbnailing. Filtered through authz.
  const rows = await db
    .select({ asset: assets, key: storageObjects.key })
    .from(assets)
    .leftJoin(
      storageObjects,
      and(eq(storageObjects.assetId, assets.id), eq(storageObjects.objectClass, 'ORIGINAL')),
    )
    .where(and(eq(assets.familyId, familyId), eq(assets.keptInHome, true)))
    .orderBy(desc(assets.createdAt));

  const visible = rows.filter((r) => canViewAsset(refOf(r.asset), viewer).allowed);

  const keepsakes: HomeKeepsake[] = await Promise.all(
    visible.map(async (r) => ({
      id: r.asset.id,
      visibility: r.asset.visibility,
      createdAtISO: r.asset.createdAt.toISOString(),
      imageUrl: r.key ? await presignDownload(r.key, 300) : null,
    })),
  );

  return {
    account,
    familyId,
    familyName: family?.displayName ?? 'Your family',
    members,
    keepsakes,
  };
}
