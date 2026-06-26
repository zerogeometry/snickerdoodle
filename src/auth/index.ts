import NextAuth from 'next-auth';
import type { EmailConfig } from 'next-auth/providers';
import { DrizzleAccountsAdapter } from './adapter';

/**
 * Passwordless magic-link auth (Auth.js v5) over our `accounts` table.
 *
 * Dev transport: the link is logged to the server console — no SMTP, no
 * credentials. Wire a real no-retention email sub-processor (and a branded
 * template) before launch; only `sendVerificationRequest` changes.
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
    // eslint-disable-next-line no-console
    console.log(
      `\n┌─────────────────────────────────────────────────────────────\n` +
        `│ ✉️  magic link for ${identifier}\n│ ${url}\n` +
        `└─────────────────────────────────────────────────────────────\n`,
    );
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
