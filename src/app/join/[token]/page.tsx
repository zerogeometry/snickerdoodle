import { IconAlertTriangle, IconLogout } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { signOut } from '@/auth';
import { SignOutForm } from '@/ui/components/SignOutForm';
import { getDb } from '@/db/client';
import { maskEmail } from '@/lib/maskEmail';
import { acceptInvite, getInviteForDisplay, safeJoinNext } from '@/server/invites';
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

export default async function JoinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const { token } = await params;
  const next = safeJoinNext((await searchParams).next);
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
    // each ending says what actually happened (04-B5): cancelled, expired, or already accepted
    const who = invite.familyName ?? 'the family';
    const ending =
      invite.status === 'REVOKED'
        ? { title: 'This invite was cancelled', text: `${who} cancelled it, or sent a newer one. Ask them for a fresh invite if you still need one.` }
        : invite.status === 'VERIFIED'
          ? { title: 'This invite has already been used', text: 'It’s already been accepted. If that was you, just sign in to see the family’s keepsakes.' }
          : { title: 'This invite has expired', text: `Invites last 14 days. Ask ${who} to send you a fresh one.` };
    return (
      <Shell>
        <div className={CARD}>
          <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-cinnamon" />
          <h1 className="mt-3 font-display text-2xl leading-tight text-cocoa">{ending.title}</h1>
          <p className="mt-2 text-sm text-ink-soft">{ending.text}</p>
        </div>
      </Shell>
    );
  }

  const account = await getCurrentAccount();

  // Not signed in → prove it's you by signing in to the invited email.
  if (!account) {
    return (
      <Shell>
        <JoinLogin maskedEmail={maskEmail(invite.email)} familyName={invite.familyName} token={token} next={next} />
      </Shell>
    );
  }

  // Signed in as a different person → can't accept on their behalf. They may be a stranger holding
  // a forwarded gift link, so the invited address is only ever shown masked (06-B1).
  if (account.email.toLowerCase() !== invite.email.toLowerCase()) {
    const invited = maskEmail(invite.email);
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
            It was sent to <b className="text-cocoa">{invited}</b>, but you&apos;re signed in as{' '}
            <b className="text-cocoa">{account.email}</b>.
          </p>
          <SignOutForm action={switchAccount}>
            <Button type="submit" variant="secondary" size="lg" className="mt-5 w-full">
              <Icon icon={IconLogout} size={16} /> sign in as {invited}
            </Button>
          </SignOutForm>
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
