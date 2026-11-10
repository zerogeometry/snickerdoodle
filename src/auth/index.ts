import NextAuth from 'next-auth';
import type { EmailConfig } from 'next-auth/providers';
import { DrizzleAccountsAdapter } from './adapter';
import { sendMail, type MailMessage } from '@/server/mail';
import { familyLabel } from '@/server/mail/words';
import { inviterForSignInLink } from '@/server/invites';
import { getDb } from '@/db/client';
import { clientIp, LIMITS, rateLimitAll } from '@/server/rateLimit';

/**
 * Passwordless magic-link auth (Auth.js v5) over our `accounts` table.
 *
 * Delivery goes through the app's Mailer port (src/server/mail): the console in dev,
 * the chosen no-retention ESP in production (decision D7) — one adapter to add.
 */
const magicLink: EmailConfig = {
  id: 'email',
  type: 'email',
  name: 'Email',
  from: 'hello@snickerdoodle.co.uk',
  // links valid for 1 hour (founder, 23 Oct — the common norm; security review D)
  maxAge: 60 * 60,
  // No SMTP server in dev — sendVerificationRequest fully overrides delivery.
  server: undefined as unknown as EmailConfig['server'],
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    // A sign-in email per address and per device is limited (no inbox flooding, no mail bill run-up).
    const gate = await rateLimitAll(getDb(), [
      { ...LIMITS.magicLinkPerEmail, caller: identifier },
      { ...LIMITS.magicLinkPerIp, caller: await clientIp() },
    ]);
    if (!gate.ok) throw new Error('too many sign-in links — try again shortly');
    await sendMail(await signInEmail(identifier, url));
  },
};

/**
 * The one-tap sign-in email. On the way into a family it says whose family, by the inviting
 * parent's first name (and shows as "Sam via snickerdoodle"), so the invitee's second email reads as
 * the next step of an invite they've just opened — not a stranger's magic link.
 */
async function signInEmail(identifier: string, url: string): Promise<MailMessage> {
  let inviter: string | null = null;
  try {
    inviter = await inviterForSignInLink(getDb(), identifier, new URL(url).searchParams.get('callbackUrl'));
  } catch {
    inviter = null; // never let the nicer wording stand between someone and their sign-in link
  }
  const signOff = '— the snickerdoodle team';
  if (inviter) {
    return {
      kind: 'magic-link',
      to: identifier,
      onBehalfOf: inviter,
      subject: `your link to join ${familyLabel(inviter)} on snickerdoodle`,
      text: `Here's your one-tap link to join ${familyLabel(inviter)} keepsake box — it works once, for the next hour:\n${url}\n\nYou asked for this from the invite ${inviter} sent you. If you didn't, you can safely ignore it.\n\n${signOff}`,
    };
  }
  return {
    kind: 'magic-link',
    to: identifier,
    subject: 'your one-tap link to snickerdoodle',
    text: `Here's your one-tap link — it works once, for the next hour:\n${url}\n\nDidn't ask for this? You can safely ignore it.\n\n${signOff}`,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAccountsAdapter(),
  session: { strategy: 'database' },
  trustHost: true,
  pages: { signIn: '/login', verifyRequest: '/login?check=1' },
  providers: [magicLink],
  callbacks: {
    // Database sessions: surface the account id on the session object so the
    // server can resolve it into a ViewerContext.
    session({ session, user }) {
      if (session.user) session.user.id = user.id;
      return session;
    },
  },
});
