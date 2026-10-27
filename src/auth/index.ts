import NextAuth from 'next-auth';
import type { EmailConfig } from 'next-auth/providers';
import { DrizzleAccountsAdapter } from './adapter';
import { sendMail } from '@/server/mail';
import { allow } from '@/server/rateLimit';

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
  maxAge: 24 * 60 * 60, // links valid for 24h
  // No SMTP server in dev — sendVerificationRequest fully overrides delivery.
  server: undefined as unknown as EmailConfig['server'],
  options: {},
  async sendVerificationRequest({ identifier, url }) {
    // a handful of links per address per hour — stops anyone using us to flood an inbox
    if (!allow('magic-link', identifier.trim().toLowerCase())) throw new Error('too many sign-in links for this address — try again later');
    await sendMail({
      kind: 'magic-link',
      to: identifier,
      subject: 'your one-tap link to snickerdoodle',
      text: `Here's your one-tap link — it works once, for 24 hours:\n${url}\n\nDidn't ask for this? You can safely ignore it.`,
    });
  },
};

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
