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
export type MailKind = 'magic-link' | 'family-invite' | 'reminder' | 'gift-list' | 'complaint-ack' | 'rights-request' | 'family-handover' | 'email-change' | 'review-alert' | 'order-ops';

export interface MailMessage {
  kind: MailKind;
  to: string;
  subject: string;
  /** Plain-text body (warm, brand voice). Links must be absolute — see appUrl(). */
  text: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

const consoleMailer: Mailer = {
  async send(m) {
    console.log(
      `\n┌─────────────────────────────────────────────────────────────\n` +
        `│ ✉️  [${m.kind}] to ${m.to} — ${m.subject}\n` +
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
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, tags: [{ name: 'kind', value: m.kind.replace(/[^a-z0-9_-]/gi, '_') }] }),
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
