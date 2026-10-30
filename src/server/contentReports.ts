import { and, eq, inArray } from 'drizzle-orm';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import { KEEPSAKE_REPORT_REASONS, REPORT_REASONS, REPORTED_BY_MEMBER_LABEL, REPORTED_LABEL } from '@/lib/reports';
import { canSetAssetVisibility, canViewAsset, type ViewerContext } from '@/authz';
import { assetRefOf, isHeldForReport } from './assetRef';
import { SUPPORT_EMAIL } from '@/lib/support';
import type { DbHandle } from './db';
import { appUrl, sendMail } from './mail';

type Detail = { labels?: string[]; original?: { status: string; labels?: string[] }; reports?: unknown[] } & Record<string, unknown>;

export type ReportResult = { ok: true } | { ok: false; reason: 'invalid' };

/**
 * Report / takedown from a gift link (D8; terms §takedown). Whoever holds the link can say
 * "something's wrong" — and the safe thing happens straight away: every keepsake on the list is
 * held (FLAGGED), which takes the list offline and keeps it from being printed, and it lands in the
 * admin review queue, where "remove" is the real cascading erase. Nobody looks at anything until a
 * reviewer chooses to (that look is audited). The team is told by email — with no picture in it.
 * A held keepsake is never deleted by the report itself: a mistaken report costs a review, not a
 * child's drawing.
 */
export async function reportGiftLink(
  db: DbHandle,
  input: { token: string; reason: string; note?: string; email?: string; accountId?: string | null },
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<ReportResult> {
  const reason = REPORT_REASONS.find((r) => r.id === input.reason);
  const note = String(input.note ?? '').trim().slice(0, 1000);
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!reason || typeof input.token !== 'string' || input.token.length < 8 || input.token.length > 200) return { ok: false, reason: 'invalid' };
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, reason: 'invalid' };

  const [link] = await db.select().from(giftLinks).where(eq(giftLinks.token, input.token));
  // Only a LIVE link can report (07-B7): a revoked or expired one shows nothing any more, so whoever
  // still holds it can't keep putting the family's keepsakes on hold (hidden + unprintable) — the
  // same answer as a made-up token.
  if (!link || link.status !== 'ACTIVE' || link.expiresAt <= now) return { ok: false, reason: 'invalid' };
  const ids = [...new Set((link.items as { assetId: string }[]).map((i) => i.assetId))];

  let held = 0;
  if (ids.length) {
    const rows = await db.select({ id: assets.id, detail: assets.moderationDetail }).from(assets).where(and(inArray(assets.id, ids), eq(assets.moderationStatus, 'CLEAR')));
    const report = { reason: reason.id, at: now.toISOString(), giftLinkId: link.id };
    for (const r of rows) {
      const d = (r.detail ?? {}) as Detail;
      const [m] = await db
        .update(assets)
        .set({
          moderationStatus: 'FLAGGED',
          moderatedAt: now,
          moderationDetail: {
            ...d,
            // keep the screening's own verdict (and its hash-check labels) where review can see it
            original: d.original ?? { status: 'CLEAR', labels: d.labels ?? [] },
            labels: [REPORTED_LABEL, reason.label],
            reports: [...(Array.isArray(d.reports) ? d.reports : []), report],
          },
        })
        .where(and(eq(assets.id, r.id), eq(assets.moderationStatus, 'CLEAR')))
        .returning({ id: assets.id });
      if (m) held++;
    }
  }

  await db.insert(auditRecords).values({
    familyId: link.familyId,
    actorAccountId: input.accountId ?? null,
    actorType: input.accountId ? 'MEMBER' : 'ANON',
    event: 'CONTENT_FLAGGED',
    targetType: 'gift_link',
    targetId: link.id,
    metadata: { via: 'gift-link report', reason: reason.id, held },
  });

  const inbox = (env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL;
  try {
    await sendMail({
      kind: 'content-report',
      to: inbox,
      ...(email ? { replyTo: email } : {}),
      subject: `[report] a gift link was reported — ${reason.id}`,
      text: [
        'Someone reported a gift link.',
        `Reason: ${reason.label}`,
        note ? `Their note: ${note}` : null,
        email ? `They’d like a reply at: ${email}` : 'They didn’t leave an email.',
        '',
        `${held} keepsake${held === 1 ? '' : 's'} on the list ${held === 1 ? 'is' : 'are'} now held: the link shows as unavailable and nothing on it can be printed.`,
        `Review them (two-step login): ${appUrl('/admin/review')}`,
        `Gift link id: ${link.id}`,
        '',
        'If anything matches the illegal-content runbook, follow it — don’t view or forward.',
      ]
        .filter((l) => l !== null)
        .join('\n'),
    });
  } catch (e) {
    console.error('report inbox not told', link.id, (e as Error).message);
  }
  return { ok: true };
}

/**
 * Report a keepsake from INSIDE the family (D8; gap audit, 27 Oct) — a relative who can see a
 * keepsake they don't manage says "something's wrong". The safe thing happens straight away: it's
 * held (FLAGGED, so nothing prints) and, while the report is open, HIDDEN from everyone but its
 * uploader/controller (authz: heldForReview), and it lands in the review queue, where "clear"
 * restores it and "remove" is the cascading erase. The team is told by email — the reason and a
 * link to the queue, never a picture, a child or a family. A CSAM-blocked keepsake is never touched;
 * a second report of one already held changes nothing (no repeat emails). The report never deletes.
 */
export async function reportKeepsake(
  db: DbHandle,
  viewer: ViewerContext,
  input: { assetId: string; reason: string; note?: string },
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<ReportResult> {
  const reason = KEEPSAKE_REPORT_REASONS.find((r) => r.id === input.reason);
  const note = String(input.note ?? '').trim().slice(0, 1000);
  if (!reason || typeof input.assetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.assetId)) return { ok: false, reason: 'invalid' };
  const [row] = await db.select().from(assets).where(eq(assets.id, input.assetId));
  if (!row) return { ok: false, reason: 'invalid' };
  const ref = assetRefOf(row);
  // already held by an open report: nothing more to do (and it's hidden from this viewer anyway)
  if (isHeldForReport(row)) return { ok: true };
  // only someone who can SEE it, and doesn't manage it (its parent can hide or delete it themselves)
  if (!canViewAsset(ref, viewer).allowed || canSetAssetVisibility(ref, viewer)) return { ok: false, reason: 'invalid' };
  if (row.moderationStatus === 'BLOCKED') return { ok: true }; // the illegal-content runbook owns it

  const d = (row.moderationDetail ?? {}) as Detail;
  const report = { reason: reason.id, at: now.toISOString(), via: 'family' };
  const [held] = await db
    .update(assets)
    .set({
      moderationStatus: 'FLAGGED',
      moderatedAt: now,
      moderationDetail: {
        ...d,
        // keep the screening's own verdict where review can see it
        original: d.original ?? { status: row.moderationStatus, labels: d.labels ?? [] },
        labels: [REPORTED_BY_MEMBER_LABEL, reason.label],
        reports: [...(Array.isArray(d.reports) ? d.reports : []), report],
      },
    })
    .where(and(eq(assets.id, row.id), inArray(assets.moderationStatus, ['CLEAR', 'PENDING', 'FLAGGED'])))
    .returning({ id: assets.id });
  if (!held) return { ok: true };

  await db.insert(auditRecords).values({
    familyId: row.familyId,
    actorAccountId: viewer.accountId,
    actorType: 'MEMBER',
    event: 'CONTENT_FLAGGED',
    targetType: 'asset',
    targetId: row.id,
    metadata: { via: 'keepsake report', reason: reason.id },
  });

  const inbox = (env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL;
  try {
    await sendMail({
      kind: 'content-report',
      to: inbox,
      subject: `[report] a keepsake was reported — ${reason.id}`,
      text: [
        'Someone in a family reported a keepsake they can see.',
        `Reason: ${reason.label}`,
        note ? `Their note: ${note}` : null,
        '',
        'It is now held: nothing can print it, and only its parent can see it until it is reviewed.',
        `Review it (two-step login): ${appUrl('/admin/review')}`,
        `Keepsake id: ${row.id}`,
        '',
        'If anything matches the illegal-content runbook, follow it — don’t view or forward.',
      ]
        .filter((l) => l !== null)
        .join('\n'),
    });
  } catch (e) {
    console.error('report inbox not told', row.id, (e as Error).message);
  }
  return { ok: true };
}
