import { and, desc, eq, inArray } from 'drizzle-orm';
import { accounts, auditRecords, consentRecords, reminderSends } from '@/db/schema';
import { appUrl, sendMail } from '@/server/mail';
import { readReminderOffToken, reminderOffLinks } from '@/server/mail/reminderOff';
import type { DbHandle } from '@/server/db';
import { NUDGES, planDigests } from './planner';
import { reminderCandidates } from '../occasions';

/** The account's CURRENT reminders-by-email consent: the latest consent_record wins. */
export async function hasReminderConsent(db: DbHandle, accountId: string): Promise<boolean> {
  const [latest] = await db
    .select({ status: consentRecords.status })
    .from(consentRecords)
    .where(and(eq(consentRecords.accountId, accountId), eq(consentRecords.channel, 'EMAIL'), eq(consentRecords.purpose, 'REMINDERS')))
    .orderBy(desc(consentRecords.createdAt))
    .limit(1);
  return latest?.status === 'GRANTED';
}

/** Record a consent change (append-only, PECR evidence) + audit it. One tap either way. */
export async function setReminderConsent(db: DbHandle, accountId: string, granted: boolean, source: string): Promise<void> {
  await db.insert(consentRecords).values({
    accountId,
    channel: 'EMAIL',
    purpose: 'REMINDERS',
    status: granted ? 'GRANTED' : 'WITHDRAWN',
    basis: 'CONSENT',
    source,
  });
  await db.insert(auditRecords).values({
    actorAccountId: accountId,
    actorType: 'MEMBER',
    event: 'CONSENT_CHANGED',
    targetType: 'consent',
    targetId: accountId,
    metadata: { channel: 'EMAIL', purpose: 'REMINDERS', status: granted ? 'GRANTED' : 'WITHDRAWN' },
  });
}

/**
 * One reminder run (daily cron → POST /api/jobs/reminders). For every family calendar: each member who
 * sees it (the owner, or someone the owner shared it with) hears about the occasions their circle may
 * see — a little one's birthday, the family's own occasions, the festivals it celebrates — about a month
 * before and about two weeks before, each with their OWN reminders consent (the pure planner decides
 * consent, timing, once-only and the gentle cap). One digest email per person per run. Each nudge is
 * recorded BEFORE the email goes out (unique per occasion per year per nudge), so a crash or an
 * overlapping run can never double-send.
 */
export async function runReminders(db: DbHandle, now = new Date()): Promise<{ planned: number; sent: number }> {
  const today = now.toISOString().slice(0, 10);
  const candidates = await reminderCandidates(db, today, NUDGES[0] + 1);
  if (candidates.length === 0) return { planned: 0, sent: 0 };

  const accountIds = [...new Set(candidates.map((c) => c.accountId))];
  const consent = new Map<string, boolean>();
  for (const id of accountIds) consent.set(id, await hasReminderConsent(db, id));
  const sent = await db
    .select({ accountId: reminderSends.accountId, occasionKey: reminderSends.occasionKey, occasionYear: reminderSends.occasionYear, offsetDays: reminderSends.offsetDays, sentAt: reminderSends.sentAt })
    .from(reminderSends)
    .where(inArray(reminderSends.accountId, accountIds));

  const digests = planDigests({ candidates, consent, sent, now });
  let delivered = 0;
  for (const d of digests) {
    // claim each nudge first; only the ones this run won go in the email
    const lines = [];
    for (const l of d.lines) {
      const childId = l.key.startsWith('child:') ? l.key.slice(6) : null;
      const [claimed] = await db
        .insert(reminderSends)
        .values({ accountId: d.accountId, occasionKey: l.key, occasionYear: l.year, offsetDays: l.offset, childId, sentAt: now })
        .onConflictDoNothing()
        .returning({ id: reminderSends.id });
      if (claimed) lines.push(l);
    }
    if (!lines.length) continue;
    const when = (n: number) => (n >= 25 ? 'in about a month' : n >= 12 ? 'in two weeks' : `in ${n} days`);
    const first = lines[0]!;
    // a real off switch: no sign-in, and the headers mail apps use for their own one-tap unsubscribe (04-B10)
    const off = reminderOffLinks(d.accountId);
    await sendMail({
      kind: 'reminder',
      to: d.email,
      headers: off.headers,
      subject: `coming up: ${first.title}${lines.length > 1 ? ` and ${lines.length - 1} more` : ''} ✦`,
      text:
        `A gentle heads-up from your family calendar:\n\n` +
        lines.map((l) => `• ${l.title}${l.note ? ` (${l.note})` : ''} — ${when(l.inDays)}, ${new Date(`${l.date}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`).join('\n') +
        `\n\nPlenty of time to turn a drawing into something they'll keep: ${appUrl('/start-creating')}\n\n` +
        `See the whole calendar: ${appUrl('/family')}\n` +
        `Don't want these nudges? Turn them off here — no need to sign in: ${off.page}`,
    });
    delivered++;
  }
  return { planned: digests.length, sent: delivered };
}

/**
 * The reminder email's off switch, from its signed link (no sign-in — 04-B10). Only ever turns
 * reminders OFF, for the account the link was made for; logged like any other consent change.
 * A tampered link does nothing.
 */
export async function turnRemindersOffByLink(db: DbHandle, token: string, source: 'email-link' | 'one-click'): Promise<{ ok: boolean }> {
  const accountId = readReminderOffToken(String(token ?? ''));
  if (!accountId) return { ok: false };
  const [exists] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, accountId));
  if (!exists) return { ok: false };
  if (await hasReminderConsent(db, accountId)) await setReminderConsent(db, accountId, false, `reminders:${source}`);
  return { ok: true };
}
