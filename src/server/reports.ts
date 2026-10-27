import { and, eq, ne } from 'drizzle-orm';
import { accounts, assets, auditRecords, giftLinks } from '@/db/schema';
import { canReportViaGiftLink, type GiftLinkGrant, type ViewerContext } from '@/authz';
import { getViewableAssetOrThrow } from './assets';
import type { DbHandle } from './db';
import type { GiftItem } from './giftLinks';
import { appUrl, sendMail } from './mail';
import { openReport, type ReportVerdict } from './reportHold';

export { openReport, type ReportVerdict };

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

/** Open reports kept per keepsake — enough for the reviewer; more adds nothing. */
const MAX_OPEN_REPORTS = 20;

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
  // Tell a reviewer once, when the keepsake first becomes held (not on every repeat report).
  if (!open) await alertReviewers(db, input.reason);
}

const REASON_WORDS: Record<ReportReason, string> = {
  worrying: 'something worrying',
  'someone-elses': 'someone else’s picture or character',
  'not-for-me': 'reached the wrong person',
  other: 'something else',
};

/**
 * Email the reviewers that something is waiting. Deliberately says nothing about the family,
 * the child or the picture — just the reason and a link to the (two-step-login) review queue.
 * Recipients: REVIEW_ALERT_EMAILS (comma-separated) if set, else every admin account.
 * A failed alert never fails the report (the keepsake is already held); it's logged loudly.
 */
async function alertReviewers(db: DbHandle, reason: ReportReason, env: Record<string, string | undefined> = process.env): Promise<void> {
  try {
    const fromEnv = (env.REVIEW_ALERT_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'));
    const to = fromEnv.length ? fromEnv : (await db.select({ email: accounts.email }).from(accounts).where(eq(accounts.isAdmin, true))).map((a) => a.email);
    for (const email of new Set(to)) {
      await sendMail({
        kind: 'review-alert',
        to: email,
        subject: 'a keepsake was reported — it’s paused for review',
        text: [
          `someone reported a keepsake (${REASON_WORDS[reason]}).`,
          'it’s paused — no printing, no gift links, hidden from relatives — until you decide.',
          '',
          `open the review queue: ${appUrl('/admin/review')}`,
        ].join('\n'),
      });
    }
  } catch (e) {
    console.error('[reports] FAILED to alert reviewers — check the review queue by hand', e instanceof Error ? e.message : e);
  }
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
