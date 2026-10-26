import { and, eq, ne } from 'drizzle-orm';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import { canReportViaGiftLink, type GiftLinkGrant, type ViewerContext } from '@/authz';
import { getViewableAssetOrThrow } from './assets';
import type { DbHandle } from './db';
import type { GiftItem } from './giftLinks';

/**
 * One-tap REPORT / TAKEDOWN (D8, docs/05). Anyone shown a keepsake — a gift-link holder or a
 * family member who can see it — can report it. A report:
 *  - holds the keepsake for review: it becomes FLAGGED, so it can't be printed, sold or served
 *    on a gift link until a reviewer decides (orders and gift links already require CLEAR);
 *  - drops it into the existing content-review queue (src/server/admin/review.ts), where CLEAR
 *    lets it go again and REMOVE is the real cascading erase;
 *  - is audited with ids + the reason only — no free text, no reporter details stored on the
 *    keepsake.
 * Reporting is idempotent in effect (an already-held item stays held), so repeat or anonymous
 * reports can't amplify anything. CSAM-BLOCKED items are never touched.
 */
export const REPORT_REASONS = ['worrying', 'someone-elses', 'not-for-me', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export function isReportReason(x: unknown): x is ReportReason {
  return typeof x === 'string' && (REPORT_REASONS as readonly string[]).includes(x);
}

type Via = 'gift-link' | 'home';
interface StoredReport {
  reason: ReportReason;
  via: Via;
  at: string;
}
/** The report verdict kept in `assets.moderation_detail.report` beside `original` / `design`. */
export interface ReportVerdict {
  status: 'FLAGGED' | 'CLEAR';
  labels: string[];
  reports: StoredReport[];
}

/** Open reports kept per keepsake — enough for the reviewer; more adds nothing. */
const MAX_OPEN_REPORTS = 20;

/** Is there an unresolved report on this keepsake? (Read by the moderation re-screen.) */
export function openReport(detail: unknown): ReportVerdict | null {
  const r = (detail as { report?: ReportVerdict } | null)?.report;
  return r && r.status === 'FLAGGED' ? r : null;
}

type AssetRow = typeof assets.$inferSelect;

async function recordReport(
  db: DbHandle,
  asset: Pick<AssetRow, 'id' | 'familyId' | 'moderationStatus' | 'moderationDetail'>,
  input: { reason: ReportReason; via: Via; actorAccountId: string | null; actorType: 'MEMBER' | 'GUEST' | 'ANON' },
  now: Date,
): Promise<void> {
  if (asset.moderationStatus === 'BLOCKED') return; // never touched, never redistributed
  const detail = (asset.moderationDetail ?? {}) as Record<string, unknown>;
  const open = openReport(detail);
  if (open && open.reports.length >= MAX_OPEN_REPORTS) return; // already held; nothing new to learn
  const reports = [...(open?.reports ?? []), { reason: input.reason, via: input.via, at: now.toISOString() }];
  const report: ReportVerdict = { status: 'FLAGGED', labels: [...new Set(reports.map((r) => `reported:${r.reason}`))], reports };
  await db
    .update(assets)
    .set({ moderationStatus: 'FLAGGED', moderatedAt: now, moderationDetail: { ...detail, report } })
    .where(and(eq(assets.id, asset.id), ne(assets.moderationStatus, 'BLOCKED')));
  await db.insert(auditRecords).values({
    familyId: asset.familyId,
    actorAccountId: input.actorAccountId,
    actorType: input.actorType,
    event: 'CONTENT_REPORTED',
    targetType: 'asset',
    targetId: asset.id,
    metadata: { reason: input.reason, via: input.via },
  });
}

/**
 * Report a keepsake shown on a gift link. The token is the capability (canReportViaGiftLink).
 * Returns false when the link/keepsake doesn't qualify — callers show the same friendly reply
 * either way, so the answer is no oracle for tokens or ids.
 */
export async function reportViaGiftLink(
  db: DbHandle,
  token: string,
  assetId: string,
  reason: ReportReason,
  reporterAccountId: string | null,
  now = new Date(),
): Promise<boolean> {
  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, token));
  if (!link) return false;
  const grant: GiftLinkGrant = {
    familyId: link.familyId,
    status: link.status === 'ACTIVE' ? 'ACTIVE' : 'REVOKED',
    expiresAt: link.expiresAt,
    assetIds: (link.items as GiftItem[]).map((i) => i.assetId),
  };
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset || !canReportViaGiftLink(grant, asset, now).allowed) return false;
  await recordReport(db, asset, { reason, via: 'gift-link', actorAccountId: reporterAccountId, actorType: reporterAccountId ? 'MEMBER' : 'GUEST' }, now);
  return true;
}

/** Report a keepsake a family member can see in the Keepsake Home. Throws AuthzError otherwise. */
export async function reportAsMember(db: DbHandle, viewer: ViewerContext, assetId: string, reason: ReportReason, now = new Date()): Promise<void> {
  await getViewableAssetOrThrow(db, assetId, viewer); // ← the gate (deny ≡ not found)
  const [asset] = await db.select().from(assets).where(eq(assets.id, assetId));
  if (!asset) return;
  await recordReport(db, asset, { reason, via: 'home', actorAccountId: viewer.accountId, actorType: 'MEMBER' }, now);
}
