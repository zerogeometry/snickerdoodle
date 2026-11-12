import NextAuth from 'next-auth';
import type { EmailConfig } from 'next-auth/providers';
import { DrizzleAccountsAdapter } from './adapter';
import { sendMail } from '@/server/mail';
import { signInEmail } from '@/server/mail/signIn';
import { newSignInCode, storeSignInCode } from './signInCode';
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
  async sendVerificationRequest({ identifier, url, provider }) {
    // A sign-in email per address and per device is limited (no inbox flooding, no mail bill run-up).
    const gate = await rateLimitAll(getDb(), [
      { ...LIMITS.magicLinkPerEmail, caller: identifier },
      { ...LIMITS.magicLinkPerIp, caller: await clientIp() },
    ]);
    if (!gate.ok) throw new Error('too many sign-in links — try again shortly');
    // The code to type instead of tapping (src/auth/signInCode.ts): the email may open in another browser or device.
    const secret = provider.secret ?? process.env.AUTH_SECRET;
    if (!secret) throw new Error('AUTH_SECRET must be set');
    const code = newSignInCode();
    await storeSignInCode(getDb(), identifier, code, secret);
    let inviter: string | null = null;
    try {
      inviter = await inviterForSignInLink(getDb(), identifier, new URL(url).searchParams.get('callbackUrl'));
    } catch {
      inviter = null; // never let the nicer wording stand between someone and their sign-in link
    }
    await sendMail(signInEmail({ to: identifier, url, code, inviter }));
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAccountsAdapter(),
  session: { strategy: 'database' },
  trustHost: true,
  // a used, expired or mistyped link or code lands back on our own sign-in card, never Auth.js's plain page
  pages: { signIn: '/login', verifyRequest: '/login?check=1', error: '/login' },
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
