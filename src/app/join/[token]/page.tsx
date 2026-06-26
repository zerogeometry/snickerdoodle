import { IconAlertTriangle, IconLogout } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { getDb } from '@/db/client';
import { acceptInvite, getInviteForDisplay } from '@/server/invites';
import { getCurrentAccount } from '@/server/session';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { JoinLogin } from './JoinLogin';

// Invite links are private and never indexed.
export const metadata: Metadata = { title: 'join a family', robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-6 py-12">
        {children}
      </main>
    </div>
  );
}

export default async function JoinPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = getDb();
  const invite = await getInviteForDisplay(db, token);

  if (!invite) {
    return (
      <Shell>
        <div className="max-w-sm rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-berry" />
          <h1 className="mt-3 font-display text-xl font-semibold text-cocoa">This invite link isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-[#6F6358]">It may have been mistyped. Ask whoever invited you to send a fresh one.</p>
        </div>
      </Shell>
    );
  }

  if (invite.status !== 'PENDING' || invite.expired) {
    return (
      <Shell>
        <div className="max-w-sm rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-honey" />
          <h1 className="mt-3 font-display text-xl font-semibold text-cocoa">This invite has already been used</h1>
          <p className="mt-2 text-sm text-[#6F6358]">
            {invite.expired ? 'It expired.' : 'It&apos;s already been accepted.'} Ask for a fresh invite if you still need
            one.
          </p>
        </div>
      </Shell>
    );
  }

  const account = await getCurrentAccount();

  // Not signed in → prove it's you by signing in to the invited email.
  if (!account) {
    return (
      <Shell>
        <JoinLogin email={invite.email} familyName={invite.familyName} token={token} />
      </Shell>
    );
  }

  // Signed in as a different person → can't accept on their behalf.
  if (account.email.toLowerCase() !== invite.email.toLowerCase()) {
    async function switchAccount() {
      'use server';
      await signOut({ redirectTo: `/join/${token}` });
    }
    return (
      <Shell>
        <div className="max-w-sm rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-honey" />
          <h1 className="mt-3 font-display text-xl font-semibold text-cocoa">This invite is for someone else</h1>
          <p className="mt-2 text-sm text-[#6F6358]">
            It was sent to <b className="text-cocoa">{invite.email}</b>, but you&apos;re signed in as{' '}
            <b className="text-cocoa">{account.email}</b>.
          </p>
          <form action={switchAccount}>
            <Button type="submit" variant="secondary" size="lg" className="mt-5 w-full">
              <Icon icon={IconLogout} size={16} /> sign in as {invite.email}
            </Button>
          </form>
        </div>
      </Shell>
    );
  }

  // Identity confirmed → accept and land in the app.
  const result = await acceptInvite(db, account, token);
  if (result.ok) redirect('/home?joined=1');

  return (
    <Shell>
      <div className="max-w-sm rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
        <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-berry" />
        <h1 className="mt-3 font-display text-xl font-semibold text-cocoa">We couldn&apos;t complete that</h1>
        <p className="mt-2 text-sm text-[#6F6358]">Please ask for a fresh invite.</p>
      </div>
    </Shell>
  );
}
