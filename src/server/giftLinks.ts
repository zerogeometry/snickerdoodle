import { randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { AuthzError, canManageFamily, canViewAsset, type ViewerContext } from '@/authz';
import { assets, auditRecords, families, giftLinks, invites, storageObjects } from '@/db/schema';
import { CATALOGUE } from '@/pricing';
import { presignDownload } from '@/storage';
import type { AccessLevel, Relationship } from '@/domain/types';
import type { DbHandle } from './db';
import { createInvite } from './invites';

const GIFT_LINK_TTL_DAYS = 30;
const GIFT_PRODUCT = 'framedPrint'; // each shared keepsake is offered as a framed print

/** A frozen line in a gift link — immutable once the link is created. */
export interface GiftItem {
  assetId: string;
  productKey: string;
  label: string;
  unitPricePence: number;
}

export interface CreateGiftLinkInput {
  familyId: string;
  assetIds: string[];
  title?: string | null;
  /** Optionally embed a family invite so the recipient can join (and earn the 5%). */
  invite?: { email: string; relationship: Relationship; accessLevel: AccessLevel } | null;
}

/**
 * Create a shareable gift link. Owner-only. The item list is FROZEN here from the
 * chosen keepsakes (each as a framed print) and never changes afterwards. An
 * unguessable token is minted; an optional embedded invite enables the join path.
 */
export async function createGiftLink(
  db: DbHandle,
  creator: ViewerContext,
  input: CreateGiftLinkInput,
): Promise<{ id: string; token: string }> {
  if (creator.accountId === null || !canManageFamily(creator.membership) || creator.membership!.familyId !== input.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can create a gift link' });
  }
  if (input.assetIds.length === 0) {
    throw new AuthzError({ allowed: false, reason: 'pick at least one keepsake to share' });
  }

  // Freeze a snapshot from the chosen keepsakes the creator can actually see + has kept.
  const rows = await db.select().from(assets).where(inArray(assets.id, input.assetIds));
  const items: GiftItem[] = [];
  for (const a of rows) {
    if (a.familyId !== input.familyId) continue;
    if (!a.keptInHome) continue;
    if (!canViewAsset({ id: a.id, familyId: a.familyId, uploaderAccountId: a.uploaderAccountId, controllerAccountId: a.controllerAccountId, visibility: a.visibility }, creator).allowed) {
      continue;
    }
    items.push({
      assetId: a.id,
      productKey: GIFT_PRODUCT,
      label: 'framed keepsake print',
      unitPricePence: CATALOGUE[GIFT_PRODUCT].pricePence,
    });
  }
  if (items.length === 0) {
    throw new AuthzError({ allowed: false, reason: 'none of those keepsakes can be shared' });
  }

  let inviteId: string | null = null;
  if (input.invite?.email.trim()) {
    const inv = await createInvite(db, creator, {
      familyId: input.familyId,
      email: input.invite.email,
      relationship: input.invite.relationship,
      accessLevel: input.invite.accessLevel,
    });
    inviteId = inv.inviteId;
  }

  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + GIFT_LINK_TTL_DAYS * 86_400_000);
  const [link] = await db
    .insert(giftLinks)
    .values({ familyId: input.familyId, createdByAccountId: creator.accountId, token, title: input.title ?? null, items, inviteId, status: 'ACTIVE', expiresAt })
    .returning();

  await db.insert(auditRecords).values({
    familyId: input.familyId,
    actorAccountId: creator.accountId,
    actorType: 'MEMBER',
    event: 'GIFT_LINK_CREATED',
    targetType: 'gift_link',
    targetId: link!.id,
    metadata: { items: items.length, hasInvite: inviteId !== null },
  });

  return { id: link!.id, token };
}

export type GiftLinkView =
  | { state: 'not-found' }
  | { state: 'revoked' }
  | { state: 'expired' }
  | { state: 'gone' } // a source keepsake was deleted
  | {
      state: 'active';
      id: string;
      familyName: string;
      title: string | null;
      inviteToken: string | null;
      items: (GiftItem & { imageUrl: string | null })[];
    };

/**
 * Resolve a gift link for the recipient. Returns a "gone" state if any source
 * keepsake has since been deleted (the frozen snapshot must never serve bytes
 * that no longer exist), and revoked/expired states accordingly.
 */
export async function getGiftLink(db: DbHandle, token: string): Promise<GiftLinkView> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, token));
  if (!link) return { state: 'not-found' };
  if (link.status === 'REVOKED') return { state: 'revoked' };
  if (link.expiresAt <= new Date()) return { state: 'expired' };

  const items = link.items as GiftItem[];
  const assetIds = items.map((i) => i.assetId);
  const present = await db.select().from(assets).where(inArray(assets.id, assetIds));
  if (present.length < assetIds.length) return { state: 'gone' }; // a source keepsake was deleted

  const keyByAsset = new Map<string, string>();
  const objs = await db
    .select()
    .from(storageObjects)
    .where(and(inArray(storageObjects.assetId, assetIds), eq(storageObjects.objectClass, 'ORIGINAL')));
  for (const o of objs) keyByAsset.set(o.assetId, o.key);

  const withImages = await Promise.all(
    items.map(async (i) => ({
      ...i,
      imageUrl: keyByAsset.has(i.assetId) ? await presignDownload(keyByAsset.get(i.assetId)!, 300) : null,
    })),
  );

  const [family] = await db.select({ name: families.displayName }).from(families).where(eq(families.id, link.familyId));
  let inviteToken: string | null = null;
  if (link.inviteId) {
    const [inv] = await db.select({ token: invites.token, status: invites.status }).from(invites).where(eq(invites.id, link.inviteId));
    if (inv && inv.status === 'PENDING') inviteToken = inv.token;
  }

  return {
    state: 'active',
    id: link.id,
    familyName: family?.name ?? 'a family',
    title: link.title,
    inviteToken,
    items: withImages,
  };
}

/** Revoke a gift link (owner-only). Audited. */
export async function revokeGiftLink(db: DbHandle, owner: ViewerContext, giftLinkId: string): Promise<{ ok: boolean }> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.id, giftLinkId));
  if (!link) return { ok: false };
  if (owner.accountId === null || !canManageFamily(owner.membership) || owner.membership!.familyId !== link.familyId) {
    throw new AuthzError({ allowed: false, reason: 'only the family owner can revoke a gift link' });
  }
  await db.update(giftLinks).set({ status: 'REVOKED', revokedAt: new Date() }).where(eq(giftLinks.id, giftLinkId));
  await db.insert(auditRecords).values({
    familyId: link.familyId,
    actorAccountId: owner.accountId,
    actorType: 'MEMBER',
    event: 'GIFT_LINK_REVOKED',
    targetType: 'gift_link',
    targetId: giftLinkId,
  });
  return { ok: true };
}
