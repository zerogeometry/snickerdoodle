import { firstNameOf } from './words';

/**
 * The ONE way the app sends email (magic links, family invites, order notes, reminders).
 * A port with swappable adapters, so choosing the real provider (decision D7 — a UK/EU
 * no-retention ESP under an Article 28 DPA) is one adapter, not a hunt through call sites.
 *
 * Adapters:
 *  - `console` (default, dev): prints the message to the server log — no third party.
 *  - `resend`: Resend's HTTP API (RESEND_API_KEY, MAIL_FROM). Used by the TEST SITE (founder,
 *    2026-10-16, EU sending region); D7 still decides the launch provider + its DPA.
 *
 * In production an unconfigured provider is a hard error, never a silent drop: a parent
 * who never receives their sign-in link is a broken product, and a missing invite email
 * is a broken family loop.
 */
export type MailKind =
  | 'magic-link' | 'family-invite' | 'reminder' | 'gift-list' | 'complaint-ack' | 'rights-request' | 'family-handover' | 'email-change'
  | 'support-ack' | 'support-request' | 'content-report' | 'order-confirmed' | 'order-shipped' | 'order-ops'
  // the family's change notices + data-rights confirmations (sweep 04 — templates in ./familyNotices, ./dataRights)
  | 'family-joined' | 'family-removed' | 'family-access-changed' | 'data-export' | 'data-deleted';

export interface MailMessage {
  kind: MailKind;
  to: string;
  subject: string;
  /** Plain-text body (warm, brand voice). Links must be absolute — see appUrl(). */
  text: string;
  /** An optional HTML body, sent alongside the text (mail apps that can't show HTML fall back to the text). Used where
   * a button reads better than a long address, e.g. the sign-in email (./signIn). Inline styles only; escape everything. */
  html?: string;
  /** Where a reply goes (e.g. support@ on a customer's acknowledgement; the customer on the team's copy). */
  replyTo?: string;
  /** Extra headers, e.g. List-Unsubscribe on the reminders (./reminderOff). */
  headers?: Record<string, string>;
  /** The person this email is on behalf of (e.g. the inviting parent). Only their FIRST name is
   * used, as the sender's name — "Sam via snickerdoodle". The address is always ours. */
  onBehalfOf?: string | null;
}

/**
 * The From line. Our address always; on someone's behalf the sender's NAME becomes "Sam via
 * snickerdoodle", so the inbox shows a name they know before it's opened, not just an unfamiliar
 * brand. First name only, letters only (firstNameOf) — nothing else from an account reaches a header.
 */
export function senderFor(from: string, onBehalfOf?: string | null): string {
  const who = firstNameOf(onBehalfOf);
  if (!who) return from;
  const address = (/<([^<>\s]+)>/.exec(from)?.[1] ?? from).trim();
  const brand = (/^\s*"?([^"<]+?)"?\s*</.exec(from)?.[1] ?? 'snickerdoodle').trim();
  return `"${who} via ${brand}" <${address}>`;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

const consoleMailer: Mailer = {
  async send(m) {
    console.log(
      `\n┌─────────────────────────────────────────────────────────────\n` +
        `│ ✉️  [${m.kind}] to ${m.to} — ${m.subject}${m.replyTo ? ` (reply to ${m.replyTo})` : ''}${m.onBehalfOf ? ` (from ${senderFor('snickerdoodle <hello@snickerdoodle.co.uk>', m.onBehalfOf)})` : ''}\n` +
        m.text
          .split('\n')
          .map((l) => `│ ${l}`)
          .join('\n') +
        `\n└─────────────────────────────────────────────────────────────\n`,
    );
  },
};

/** Resend over plain fetch (no SDK). A failed send throws — never a silent drop. */
export function resendMailer(apiKey: string, from: string, doFetch: typeof fetch = fetch): Mailer {
  return {
    async send(m) {
      const res = await doFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: senderFor(from, m.onBehalfOf), to: [m.to], subject: m.subject, text: m.text, ...(m.html ? { html: m.html } : {}), ...(m.replyTo ? { reply_to: m.replyTo } : {}), ...(m.headers ? { headers: m.headers } : {}), tags: [{ name: 'kind', value: m.kind.replace(/[^a-z0-9_-]/gi, '_') }] }),
      });
      if (!res.ok) throw new Error(`email not sent (${res.status}) — check the Resend key and domain`);
    },
  };
}

export function resolveMailer(env: Record<string, string | undefined> = process.env): Mailer {
  const provider = (env.MAIL_PROVIDER ?? '').trim() || (env.NODE_ENV === 'production' ? '' : 'console');
  if (provider === 'console') return consoleMailer;
  if (provider === 'resend') {
    if (!env.RESEND_API_KEY || !env.MAIL_FROM) throw new Error('MAIL_PROVIDER=resend needs RESEND_API_KEY and MAIL_FROM');
    return resendMailer(env.RESEND_API_KEY, env.MAIL_FROM);
  }
  throw new Error(
    provider
      ? `MAIL_PROVIDER="${provider}" has no adapter yet — add one in src/server/mail (decision D7)`
      : 'MAIL_PROVIDER is not set — production must send real email (decision D7)',
  );
}

export async function sendMail(message: MailMessage): Promise<void> {
  await resolveMailer().send(message);
}

/** An absolute link into the app, from the configured canonical origin (never a hard-coded host). */
export function appUrl(path: string, env: Record<string, string | undefined> = process.env): string {
  const base = (env.APP_URL || env.AUTH_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}
