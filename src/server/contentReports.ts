import { and, eq, inArray } from 'drizzle-orm';
import { assets, auditRecords, giftLinks } from '@/db/schema';
import { REPORT_REASONS, REPORTED_LABEL } from '@/lib/reports';
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
  if (!link) return { ok: false, reason: 'invalid' };
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
