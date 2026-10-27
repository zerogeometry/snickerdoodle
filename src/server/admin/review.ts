import { and, desc, eq } from 'drizzle-orm';
import { assets, auditRecords, profileImages, storageObjects } from '@/db/schema';
import { AuthzError, canReview, hashCheckSkipped, type Reviewer, type ReviewSubject } from '@/authz';
import { derivativeKey, getObjectBytes } from '@/storage';
import { eraseAsset } from '../assets';
import { eraseProfileImage } from '../profile';
import type { DbHandle } from '../db';

/**
 * The content-review queue (D8): what the automated checks FLAGGED, for a human to clear or
 * remove. Every look and every decision is audited; CSAM-BLOCKED items are counted, never shown.
 * All access goes through canReview (src/authz/review.ts).
 */
export type ReviewKind = 'keepsake' | 'profile';

export interface ReviewItem {
  kind: ReviewKind;
  id: string;
  /** What flagged it (classifier labels, "drawn-words", "screening-not-configured"…). */
  labels: string[];
  /** The upload itself, or something drawn/added in the Studio. */
  source: 'upload' | 'studio design' | 'profile picture' | 'profile header' | 'family banner';
  flaggedAt: Date | null;
  /** The known-CSAM hash check never ran on it: it can only be removed — never looked at or cleared. */
  hashUnchecked: boolean;
}

const deny = (reason: string) => {
  throw new AuthzError({ allowed: false, reason });
};
const gate = (r: Reviewer, action: Parameters<typeof canReview>[1], item?: ReviewSubject) => {
  const d = canReview(r, action, item);
  if (!d.allowed) deny(d.reason);
};

type Detail = { labels?: string[]; original?: { status: string; labels?: string[] }; design?: { status: string; labels?: string[] } };

export async function reviewQueue(db: DbHandle, reviewer: Reviewer): Promise<{ items: ReviewItem[]; blocked: number }> {
  gate(reviewer, 'open-queue');
  const flagged = await db
    .select({ id: assets.id, detail: assets.moderationDetail, at: assets.moderatedAt, status: assets.moderationStatus })
    .from(assets)
    .where(eq(assets.moderationStatus, 'FLAGGED'))
    .orderBy(desc(assets.moderatedAt));
  const profiles = await db
    .select({ id: profileImages.id, kind: profileImages.kind, detail: profileImages.moderationDetail, at: profileImages.moderatedAt, status: profileImages.moderationStatus })
    .from(profileImages)
    .where(eq(profileImages.moderationStatus, 'FLAGGED'));
  const blockedA = await db.select({ id: assets.id }).from(assets).where(eq(assets.moderationStatus, 'BLOCKED'));
  const blockedP = await db.select({ id: profileImages.id }).from(profileImages).where(eq(profileImages.moderationStatus, 'BLOCKED'));
  const items: ReviewItem[] = [
    ...flagged.map((r) => {
      const d = (r.detail ?? {}) as Detail;
      const fromDesign = d.design?.status === 'FLAGGED';
      return { kind: 'keepsake' as const, id: r.id, labels: (fromDesign ? d.design?.labels : d.labels) ?? [], source: fromDesign ? ('studio design' as const) : ('upload' as const), flaggedAt: r.at, hashUnchecked: hashCheckSkipped({ moderationStatus: r.status, moderationDetail: r.detail }) };
    }),
    ...profiles.map((r) => ({
      kind: 'profile' as const,
      id: r.id,
      labels: ((r.detail ?? {}) as Detail).labels ?? [],
      source: r.kind === 'AVATAR' ? ('profile picture' as const) : r.kind === 'ACCOUNT_HEADER' ? ('profile header' as const) : ('family banner' as const),
      flaggedAt: r.at,
      hashUnchecked: hashCheckSkipped({ moderationStatus: r.status, moderationDetail: r.detail }),
    })),
  ];
  items.sort((a, b) => (b.flaggedAt?.getTime() ?? 0) - (a.flaggedAt?.getTime() ?? 0));
  return { items, blocked: blockedA.length + blockedP.length };
}

/** The flagged picture's bytes, for a reviewer who chose to look — the look is audited first. */
export async function reviewImage(db: DbHandle, reviewer: Reviewer, kind: ReviewKind, id: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (kind === 'profile') {
    const [p] = await db.select().from(profileImages).where(eq(profileImages.id, id));
    if (!p) deny('not found');
    gate(reviewer, 'view', p!);
    await audit(db, reviewer, 'CONTENT_REVIEW_VIEWED', 'profile_image', id, p!.familyId, { source: p!.kind });
    return { bytes: await getObjectBytes(p!.key), contentType: p!.contentType };
  }
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  if (!a) deny('not found');
  gate(reviewer, 'view', a!);
  // show what was flagged: the Studio design when that's the culprit, else the upload
  const d = (a!.moderationDetail ?? {}) as Detail;
  let key: string | null = null;
  let contentType = 'image/png'; // Studio designs are always PNG
  if (d.design?.status === 'FLAGGED') key = derivativeKey(id, 'design');
  if (!key) {
    const [o] = await db.select({ key: storageObjects.key, contentType: storageObjects.contentType }).from(storageObjects).where(and(eq(storageObjects.assetId, id), eq(storageObjects.objectClass, 'ORIGINAL')));
    key = o?.key ?? null;
    contentType = o?.contentType ?? 'application/octet-stream';
  }
  if (!key) deny('no picture');
  await audit(db, reviewer, 'CONTENT_REVIEW_VIEWED', 'asset', id, a!.familyId, { source: d.design?.status === 'FLAGGED' ? 'studio design' : 'upload' });
  const bytes = await getObjectBytes(key!);
  return { bytes, contentType };
}

/**
 * The reviewer's decision. CLEAR → it may be printed/shown again (and the stored upload/design
 * verdicts say so, so a later re-screen of the other half can't quietly re-flag it). REMOVE → the
 * real, cascading erase (bytes, rows, erasure ledger), as a takedown.
 */
export async function decideReview(db: DbHandle, reviewer: Reviewer, kind: ReviewKind, id: string, decision: 'clear' | 'remove', now = new Date()): Promise<void> {
  if (kind === 'profile') {
    const [p] = await db.select().from(profileImages).where(eq(profileImages.id, id));
    if (!p) deny('not found');
    gate(reviewer, decision, p!);
    await audit(db, reviewer, 'CONTENT_REVIEWED', 'profile_image', id, p!.familyId, { decision, labels: ((p!.moderationDetail ?? {}) as Detail).labels ?? [] });
    if (decision === 'remove') return eraseProfileImage(db, p!);
    await db
      .update(profileImages)
      .set({ moderationStatus: 'CLEAR', moderatedAt: now, moderationDetail: { ...((p!.moderationDetail ?? {}) as object), review: { decision, by: reviewer.accountId, at: now.toISOString() } } })
      .where(eq(profileImages.id, id));
    return;
  }
  const [a] = await db.select().from(assets).where(eq(assets.id, id));
  if (!a) deny('not found');
  gate(reviewer, decision, a!);
  const d = (a!.moderationDetail ?? {}) as Detail;
  await audit(db, reviewer, 'CONTENT_REVIEWED', 'asset', id, a!.familyId, { decision, labels: d.design?.labels ?? d.labels ?? [] });
  if (decision === 'remove') {
    await eraseAsset(db, { id, familyId: a!.familyId }, { accountId: reviewer.accountId, actorType: 'ADMIN' }, { reason: 'content review — removed' });
    return;
  }
  const cleared = (v?: { status: string; labels?: string[] }) => (v ? { ...v, status: 'CLEAR' } : v);
  await db
    .update(assets)
    .set({
      moderationStatus: 'CLEAR',
      moderatedAt: now,
      // a clear RESOLVES any open viewer reports (kept as history) — so the keepsake is visible to the
      // family again, and a later re-screen can't revive a report the reviewer already settled
      moderationDetail: {
        ...withoutOpenReports(d),
        original: cleared(d.original) ?? { status: 'CLEAR', labels: d.labels ?? [] },
        design: cleared(d.design),
        review: { decision, by: reviewer.accountId, at: now.toISOString() },
      },
    })
    .where(eq(assets.id, id));
}

/** The detail with its open reports moved to `resolvedReports`. */
function withoutOpenReports<T extends object>(d: T): T {
  const { reports, ...rest } = d as T & { reports?: unknown; resolvedReports?: unknown };
  if (!Array.isArray(reports) || reports.length === 0) return d;
  const before = Array.isArray((rest as { resolvedReports?: unknown }).resolvedReports) ? ((rest as { resolvedReports: unknown[] }).resolvedReports) : [];
  return { ...rest, resolvedReports: [...before, ...reports] } as T;
}

async function audit(db: DbHandle, reviewer: Reviewer, event: 'CONTENT_REVIEW_VIEWED' | 'CONTENT_REVIEWED', targetType: string, targetId: string, familyId: string | null, metadata: Record<string, unknown>) {
  await db.insert(auditRecords).values({ familyId, actorAccountId: reviewer.accountId, actorType: 'ADMIN', event, targetType, targetId, metadata });
}

