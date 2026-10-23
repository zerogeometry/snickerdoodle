import { randomBytes } from 'node:crypto';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import { supportRequests } from '@/db/schema';
import { SUPPORT_EMAIL, cleanOrderRef, supportTopic } from '@/lib/support';
import type { DbHandle } from './db';
import { appUrl, sendMail } from './mail';

/** Help-form messages a single email address can send in a day (stops the acknowledgement being
 * used to spam someone else's inbox). */
export const SUPPORT_PER_EMAIL_PER_DAY = 5;
/** How long a help message is kept before the retention job deletes it (2 years — long enough to
 * look back on an order problem, then gone). Stated in the privacy notice. */
export const SUPPORT_RETENTION_DAYS = 730;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const newRef = () => `S-${randomBytes(4).toString('hex').toUpperCase().slice(0, 6)}`;

export type SupportResult = { ok: true; ref: string } | { ok: false; reason: 'invalid' | 'too-many' };

/**
 * A message from the help page. Saved FIRST — so a wobbly email service never loses one — then the
 * customer gets an acknowledgement (replies go to support@) and the team gets the message at the
 * support inbox (replies go straight to the customer). An email that fails is logged, never thrown:
 * the message is safe either way, and the admin inbox (/admin/support) shows everything.
 */
export async function submitSupportRequest(
  db: DbHandle,
  input: { topic: string; email: string; name?: string; orderRef?: string; message: string; accountId?: string | null },
  now = new Date(),
  env: Record<string, string | undefined> = process.env,
): Promise<SupportResult> {
  const topic = supportTopic(input.topic);
  const email = String(input.email ?? '').trim().toLowerCase();
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  const message = String(input.message ?? '').trim();
  const orderRef = topic?.order ? cleanOrderRef(input.orderRef) : null;
  if (!topic) return { ok: false, reason: 'invalid' };
  if (email.length > 254 || !EMAIL.test(email)) return { ok: false, reason: 'invalid' };
  if (name.length > 80) return { ok: false, reason: 'invalid' };
  if (message.length < 10 || message.length > 4000) return { ok: false, reason: 'invalid' };

  const [{ recent }] = (await db
    .select({ recent: sql<number>`count(*)::int` })
    .from(supportRequests)
    .where(and(eq(supportRequests.email, email), gt(supportRequests.receivedAt, new Date(now.getTime() - 86_400_000))))) as [{ recent: number }];
  if (recent >= SUPPORT_PER_EMAIL_PER_DAY) return { ok: false, reason: 'too-many' };

  const ref = newRef();
  const [row] = await db
    .insert(supportRequests)
    .values({ ref, topic: topic.id, accountId: input.accountId ?? null, email, name: name || null, orderRef, message, receivedAt: now })
    .returning({ id: supportRequests.id });

  const hi = name ? `Hi ${name.split(' ')[0]},` : 'Hello,';
  try {
    await sendMail({
      kind: 'support-ack',
      to: email,
      replyTo: SUPPORT_EMAIL,
      subject: `we’ve got your message (ref ${ref})`,
      text: [
        hi,
        '',
        `Thanks for getting in touch about “${topic.label.replace(/\?$/, '')}”. A real person will read your message and reply to this email address.`,
        orderRef ? `We’ve noted your order ${orderRef}.` : null,
        `Your reference is ${ref} — just reply to this email if there’s anything to add.`,
        '',
        `In the meantime, lots of answers are at ${appUrl('/help')}.`,
        '',
        '— the Snickerdoodle team',
      ]
        .filter((l) => l !== null)
        .join('\n'),
    });
    await db.update(supportRequests).set({ ackSentAt: new Date() }).where(eq(supportRequests.id, row!.id));
  } catch (e) {
    console.error('support ack not sent', ref, (e as Error).message);
  }

  const inbox = (env.SUPPORT_INBOX ?? '').trim() || SUPPORT_EMAIL;
  try {
    await sendMail({
      kind: 'support-request',
      to: inbox,
      replyTo: email,
      subject: `[${ref}] ${topic.label}${orderRef ? ` · ${orderRef}` : ''}`,
      text: [
        `From: ${name || '(no name)'} <${email}>${input.accountId ? ' · signed in' : ' · not signed in'}`,
        `Topic: ${topic.label}`,
        orderRef ? `Order: ${orderRef}` : null,
        `Reference: ${ref}`,
        '',
        message,
        '',
        '— reply to this email to answer them directly.',
      ]
        .filter((l) => l !== null)
        .join('\n'),
    });
    await db.update(supportRequests).set({ teamNotifiedAt: new Date() }).where(eq(supportRequests.id, row!.id));
  } catch (e) {
    console.error('support inbox not told', ref, (e as Error).message);
  }

  return { ok: true, ref };
}

/** Retention: help messages are deleted SUPPORT_RETENTION_DAYS after they arrived. */
export async function purgeExpiredSupportRequests(db: DbHandle, now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - SUPPORT_RETENTION_DAYS * 86_400_000);
  const gone = await db.delete(supportRequests).where(lt(supportRequests.receivedAt, cutoff)).returning({ id: supportRequests.id });
  return gone.length;
}
