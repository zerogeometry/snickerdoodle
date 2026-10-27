import { and, eq } from 'drizzle-orm';
import { accounts, assets, memberships } from '@/db/schema';
import { canSetAssetVisibility, type ViewerContext } from '@/authz';
import type { VisibilityTier } from '@/domain/types';
import type { DbHandle } from './db';
import { getViewableAssetOrThrow } from './assets';

/** What the Studio's "this stays yours" pill shows about the creation being edited. */
export interface StudioKeepsakeInfo {
  /** A guest-style draft: only its uploader (claim holder) can see it, until it's kept. */
  draft: boolean;
  kept: boolean;
  visibility: VisibilityTier;
  /** The viewer is the controlling parent: they choose who sees it and can delete it. */
  canManage: boolean;
  /** The family's OTHER active members (initial + circle) — the real "who's included". */
  people: { initial: string; circle: 'FAMILY' | 'EXTENDED' }[];
}

/** Read through the gate; who-can-see is resolved here, never taken from the browser. */
export async function studioKeepsakeInfo(db: DbHandle, viewer: ViewerContext, assetId: string): Promise<StudioKeepsakeInfo> {
  const ref = await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate
  const [row] = await db.select({ kept: assets.keptInHome }).from(assets).where(eq(assets.id, assetId));
  const draft = ref.ephemeralClaimId != null;
  const canManage = !draft && canSetAssetVisibility(ref, viewer);
  let people: StudioKeepsakeInfo['people'] = [];
  // only the controller is shown who else is in the family (they're the one choosing)
  if (canManage && ref.familyId) {
    const rows = await db
      .select({ accountId: memberships.accountId, circle: memberships.circle, name: accounts.displayName, email: accounts.email })
      .from(memberships)
      .innerJoin(accounts, eq(memberships.accountId, accounts.id))
      .where(and(eq(memberships.familyId, ref.familyId), eq(memberships.status, 'ACTIVE')));
    people = rows
      .filter((r) => r.accountId !== viewer.accountId)
      .map((r) => ({ initial: (r.name ?? r.email.split('@')[0] ?? 'M').charAt(0).toUpperCase(), circle: r.circle }));
  }
  return { draft, kept: row?.kept === true, visibility: ref.visibility, canManage, people };
}
