import { and, eq, inArray, ne } from 'drizzle-orm';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import type { ViewerContext } from '@/authz';
import { HOME_REPORT_REASONS, isHeldForReview, REPORT_REASONS, REPORTED_FROM_HOME_LABEL, REPORTED_LABEL, type StoredReport } from '@/lib/reports';
import { SUPPORT_EMAIL } from '@/lib/support';
import { getViewableAssetOrThrow } from './assets';
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
  if (!link) return { ok: false, reason: 'invalid' };
  const ids = [...new Set((link.items as { assetId: string }[]).map((i) => i.assetId))];

  let held = 0;
  if (ids.length) {
    const rows = await db.select({ id: assets.id, detail: assets.moderationDetail }).from(assets).where(and(inArray(assets.id, ids), eq(assets.moderationStatus, 'CLEAR')));
    const report: StoredReport = { reason: reason.id, at: now.toISOString(), via: 'gift-link', giftLinkId: link.id };
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
 * Report a keepsake from the Keepsake Home (founder decision 2026-10-26). Any family member shown a
 * keepsake they don't manage can say "something's wrong" — and the safe thing happens straight
 * away: the keepsake is HELD (FLAGGED with an open report), which hides it from every relative
 * (only its uploader/controller still sees it, marked "being checked"), keeps it from being printed
 * or shared on a gift link, and puts it in the admin review queue. A reviewer's CLEAR lets it be
 * seen again; REMOVE is the real cascading erase. The team is told by email — with no picture in
 * it. Only the reason is kept on the keepsake; never the reporter, their note or their email.
 *
 * The gate is the view check (deny ≡ not found → AuthzError). A keepsake already held isn't held
 * twice; CSAM-BLOCKED content is never touched.
 */
export async function reportKeepsakeFromHome(
  db: DbHandle,
  viewer: ViewerContext,
  input: { assetId: string; reason: string; note?: string; email?: string },
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<ReportResult> {
  const reason = HOME_REPORT_REASONS.find((r) => r.id === input.reason);
  const note = String(input.note ?? '').trim().slice(0, 1000);
  const email = String(input.email ?? '').trim().toLowerCase();
  if (!reason || typeof input.assetId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.assetId)) return { ok: false, reason: 'invalid' };
  if (email && (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return { ok: false, reason: 'invalid' };

  await getViewableAssetOrThrow(db, input.assetId, viewer); // ← the gate (deny ≡ not found)
  const [row] = await db.select().from(assets).where(eq(assets.id, input.assetId));
  if (!row || row.moderationStatus === 'BLOCKED') return { ok: true }; // never touched, never redistributed

  const d = (row.moderationDetail ?? {}) as Detail;
  const alreadyHeld = isHeldForReview(row);
  if (!alreadyHeld) {
    const report: StoredReport = { reason: reason.id, at: now.toISOString(), via: 'home' };
    // Not screened yet: it stays PENDING (held all the same) and the screening folds the report in
    // when it lands (src/server/moderation) — a reviewer must never be able to CLEAR an unscreened
    // picture past the hash check.
    const pending = row.moderationStatus === 'PENDING';
    await db
      .update(assets)
      .set({
        moderationStatus: pending ? 'PENDING' : 'FLAGGED',
        moderatedAt: pending ? row.moderatedAt : now,
        moderationDetail: {
          ...d,
          // keep the screening's own verdict where review can see it (and whether the hash check ran)
          ...(pending ? {} : { original: d.original ?? { status: row.moderationStatus, labels: d.labels ?? [] } }),
          labels: [...new Set([REPORTED_FROM_HOME_LABEL, reason.label, ...(row.moderationStatus === 'CLEAR' ? [] : (d.labels ?? []))])],
          reports: [...(Array.isArray(d.reports) ? d.reports : []), report],
        },
      })
      .where(and(eq(assets.id, row.id), ne(assets.moderationStatus, 'BLOCKED')));
  }

  await db.insert(auditRecords).values({
    familyId: row.familyId,
    actorAccountId: viewer.accountId,
    actorType: 'MEMBER',
    event: 'CONTENT_FLAGGED',
    targetType: 'asset',
    targetId: row.id,
    metadata: { via: 'home report', reason: reason.id, held: !alreadyHeld },
  });

  const inbox = (env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL;
  try {
    await sendMail({
      kind: 'content-report',
      to: inbox,
      ...(email ? { replyTo: email } : {}),
      subject: `[report] a keepsake was reported from the keepsake home — ${reason.id}`,
      text: [
        'A family member reported a keepsake they were shown in their keepsake home.',
        `Reason: ${reason.label}`,
        note ? `Their note: ${note}` : null,
        email ? `They’d like a reply at: ${email}` : 'They didn’t leave an email.',
        '',
        alreadyHeld
          ? 'It was already held for review.'
          : 'It’s now held: hidden from the rest of the family (only the parent who manages it still sees it), and it can’t be printed or shared.',
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
