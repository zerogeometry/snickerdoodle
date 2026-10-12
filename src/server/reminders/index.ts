import { and, desc, eq, inArray, isNotNull, or } from 'drizzle-orm';
import { accounts, auditRecords, children, consentRecords, memberships, reminderSends } from '@/db/schema';
import { appUrl, sendMail } from '@/server/mail';
import type { DbHandle } from '@/server/db';
import { planReminders, type PlannerRecipient } from './planner';

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
 * One reminder run (daily cron → POST /api/jobs/reminders). Recipients are the parent who
 * entered the birthday AND relatives the parent shared the family calendar with — each only
 * with their OWN reminders consent; consent + caps are decided by the pure planner.
 * The send is recorded BEFORE the email goes out (unique per occasion), so a crash or an
 * overlapping run can never double-send.
 */
export async function runReminders(db: DbHandle, now = new Date()): Promise<{ planned: number; sent: number }> {
  const kids = await db
    .select({ id: children.id, familyId: children.familyId, firstName: children.firstName, birthday: children.birthday })
    .from(children)
    .where(isNotNull(children.birthday));
  if (kids.length === 0) return { planned: 0, sent: 0 };

  const familyIds = [...new Set(kids.map((k) => k.familyId))];
  const owners = await db
    .select({ accountId: memberships.accountId, familyId: memberships.familyId, email: accounts.email })
    .from(memberships)
    .innerJoin(accounts, eq(accounts.id, memberships.accountId))
    .where(
      and(
        inArray(memberships.familyId, familyIds),
        eq(memberships.status, 'ACTIVE'),
        or(eq(memberships.isOwner, true), eq(memberships.seesOccasions, true)),
      ),
    );

  const recipients: PlannerRecipient[] = [];
  for (const o of owners) recipients.push({ ...o, remindersConsent: await hasReminderConsent(db, o.accountId) });

  const sent = await db
    .select({ accountId: reminderSends.accountId, childId: reminderSends.childId, occasionYear: reminderSends.occasionYear, sentAt: reminderSends.sentAt })
    .from(reminderSends)
    .where(inArray(reminderSends.accountId, recipients.map((r) => r.accountId).concat(['00000000-0000-0000-0000-000000000000'])));

  const plan = planReminders({
    children: kids.map((k) => ({ ...k, birthday: String(k.birthday).slice(0, 10) })),
    recipients,
    sent,
    now,
  });

  let delivered = 0;
  for (const p of plan) {
    const [claimed] = await db
      .insert(reminderSends)
      .values({ accountId: p.accountId, childId: p.childId, occasionYear: p.occasionYear, sentAt: now })
      .onConflictDoNothing()
      .returning({ id: reminderSends.id });
    if (!claimed) continue; // another run already took this occasion
    await sendMail({
      kind: 'reminder',
      to: p.email,
      subject: `${p.firstName} turns ${p.turns} soon ✦`,
      text:
        `${p.firstName} turns ${p.turns} in ${p.inDays} days — plenty of time to turn a drawing into something they'll keep.\n\n` +
        `Make something: ${appUrl('/start-creating')}\n\n` +
        `Don't want birthday nudges? Turn them off in one tap: ${appUrl('/home')}`,
    });
    delivered++;
  }
  return { planned: plan.length, sent: delivered };
}
