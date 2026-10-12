import { IconAlertTriangle, IconLogout } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { getDb } from '@/db/client';
import { acceptInvite, getInviteForDisplay } from '@/server/invites';
import { getCurrentAccount } from '@/server/session';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { JoinLogin } from './JoinLogin';

// The paper card every invite state sits on (Scrapbook D12).
const CARD = 'pop-in tape w-full max-w-sm rounded-[22px] border-2 border-cocoa bg-paper p-7 text-center shadow-[0_4px_0_var(--color-cocoa)]';

// Invite links are private and never indexed.
export const metadata: Metadata = { title: 'join a family', robots: { index: false, follow: false } };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </main>
    </div>
  );
}

/** Where to land after joining. ONLY a gift-link path is honoured (an open redirect is
 * never possible): the relative came from a gift list, so they go back to finish it. */
function safeNext(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v && /^\/g\/[A-Za-z0-9_-]{8,128}$/.test(v) ? v : null;
}

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { token } = await params;
  const next = safeNext((await searchParams).next);
  const db = getDb();
  const invite = await getInviteForDisplay(db, token);

  if (!invite) {
    return (
      <Shell>
        <div className={CARD}>
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-cinnamon" />
          <h1 className="mt-3 font-display text-2xl leading-tight text-cocoa">This invite link isn&apos;t valid</h1>
          <p className="mt-2 text-sm text-ink-soft">It may have been mistyped. Ask whoever invited you to send a fresh one.</p>
        </div>
      </Shell>
    );
  }

  if (invite.status !== 'PENDING' || invite.expired) {
    return (
      <Shell>
        <div className={CARD}>
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-cinnamon" />
          <h1 className="mt-3 font-display text-2xl leading-tight text-cocoa">This invite has already been used</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {invite.expired ? 'It expired.' : 'It’s already been accepted.'} Ask for a fresh invite if you still need
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
        <JoinLogin email={invite.email} familyName={invite.familyName} token={token} next={next} />
      </Shell>
    );
  }

  // Signed in as a different person → can't accept on their behalf.
  if (account.email.toLowerCase() !== invite.email.toLowerCase()) {
    async function switchAccount() {
      'use server';
      await signOut({ redirectTo: `/join/${token}${next ? `?next=${encodeURIComponent(next)}` : ''}` });
    }
    return (
      <Shell>
        <div className={CARD}>
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-cinnamon" />
          <h1 className="mt-3 font-display text-2xl leading-tight text-cocoa">This invite is for someone else</h1>
          <p className="mt-2 text-sm text-ink-soft">
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
  if (result.ok) redirect(next ?? '/home?joined=1');

  return (
    <Shell>
      <div className={CARD}>
        <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-cinnamon" />
        <h1 className="mt-3 font-display text-2xl leading-tight text-cocoa">We couldn&apos;t complete that</h1>
        <p className="mt-2 text-sm text-ink-soft">Please ask for a fresh invite.</p>
      </div>
    </Shell>
  );
}
