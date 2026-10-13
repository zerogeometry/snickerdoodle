import { and, eq, gt, sql } from 'drizzle-orm';
import { auditRecords, rightsRequests } from '@/db/schema';
import type { DbHandle } from './db';
import { sendMail } from './mail';

/** The statutory window to acknowledge a data-protection complaint (DUAA s.164A). */
export const COMPLAINT_ACK_DAYS = 30;
/** Max complaints accepted per email address per day — stops the acknowledgement email being
 * used to spam someone else's inbox. */
export const COMPLAINTS_PER_EMAIL_PER_DAY = 3;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ComplaintResult = { ok: true; ref: string } | { ok: false; reason: 'invalid' | 'too-many' };

/**
 * Take a data-protection complaint (the s.164A channel). It is recorded as a COMPLAINT rights
 * request with its due date, audited (ids only — never the complaint's words), and acknowledged
 * by email straight away, so the 30-day acknowledgement duty is met on receipt. If PRIVACY_INBOX
 * is set, the team is told there's a new one (with the reference, not the content).
 */
export async function submitComplaint(
  db: DbHandle,
  input: { name: string; email: string; message: string; accountId?: string | null },
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<ComplaintResult> {
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  const email = String(input.email ?? '').trim().toLowerCase();
  const message = String(input.message ?? '').trim();
  if (name.length < 1 || name.length > 80) return { ok: false, reason: 'invalid' };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, reason: 'invalid' };
  if (message.length < 10 || message.length > 5000) return { ok: false, reason: 'invalid' };

  const [{ recent }] = (await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(rightsRequests)
    .where(
      and(
        eq(rightsRequests.subjectEmail, email),
        eq(rightsRequests.type, 'COMPLAINT'),
        gt(rightsRequests.receivedAt, new Date(now.getTime() - 86_400_000)),
      ),
    )) as [{ recent: number }];
  if (recent >= COMPLAINTS_PER_EMAIL_PER_DAY) return { ok: false, reason: 'too-many' };

  const [row] = await db
    .insert(rightsRequests)
    .values({
      type: 'COMPLAINT',
      status: 'RECEIVED',
      subjectAccountId: input.accountId ?? null,
      subjectEmail: email,
      requesterName: name,
      details: message,
      receivedAt: now,
      dueAt: new Date(now.getTime() + COMPLAINT_ACK_DAYS * 86_400_000),
    })
    .returning({ id: rightsRequests.id });
  const ref = `C-${row!.id.slice(0, 8).toUpperCase()}`;

  await db.insert(auditRecords).values({
    actorAccountId: input.accountId ?? null,
    actorType: input.accountId ? 'MEMBER' : 'ANON',
    event: 'RIGHTS_REQUEST_RECEIVED',
    targetType: 'rights_request',
    targetId: row!.id,
    metadata: { type: 'COMPLAINT' },
  });

  await sendMail({
    kind: 'complaint-ack',
    to: email,
    subject: `we’ve got your message (ref ${ref})`,
    text: [
      `Hi ${name.split(' ')[0]},`,
      '',
      'Thank you for telling us — we’ve received your data-protection complaint and a real person will look into it.',
      `Your reference is ${ref}. We’ll keep you posted as we go, and tell you the outcome.`,
      '',
      'If you’re not happy with how we handle it, you can also contact the Information Commissioner’s Office at ico.org.uk.',
      '',
      '— the Snickerdoodle team',
    ].join('\n'),
  });
  await db.update(rightsRequests).set({ complaintAckAt: new Date() }).where(eq(rightsRequests.id, row!.id));

  const inbox = (env.PRIVACY_INBOX ?? '').trim();
  if (inbox) {
    await sendMail({
      kind: 'rights-request',
      to: inbox,
      subject: `new data-protection complaint ${ref}`,
      text: `A complaint came in (${ref}). Acknowledged automatically; respond by ${new Date(now.getTime() + COMPLAINT_ACK_DAYS * 86_400_000).toDateString()}.\nThe details are in rights_requests — not repeated here.`,
    });
  }

  return { ok: true, ref };
}
