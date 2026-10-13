import { IconCircleCheck, IconMailX } from '@tabler/icons-react';
import type { Metadata } from 'next';
import { getDb } from '@/db/client';
import { confirmEmailChange } from '@/server/profile';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { FlowHeader } from '@/ui/components/FlowHeader';

export const metadata: Metadata = { title: 'confirm your email', robots: { index: false, follow: false } };
export const dynamic = 'force-dynamic';

/** The link from the new inbox. Confirms the change server-side, then says plainly what happened. */
export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token;
  const res = typeof token === 'string' && token.length > 20 ? await confirmEmailChange(getDb(), token) : { ok: false as const, reason: 'expired' as const };

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader />
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className={`flex h-20 w-20 items-center justify-center rounded-full ${res.ok ? 'bg-leaf-pale' : 'bg-berry-pale'}`}>
          <Icon icon={res.ok ? IconCircleCheck : IconMailX} size={40} className={res.ok ? 'text-green-save' : 'text-cinnamon'} />
        </div>
        <h1 className="mt-5 font-display text-3xl text-cocoa">{res.ok ? 'that’s your new email ✓' : 'that link didn’t work'}</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          {res.ok
            ? 'from now on, sign in and hear from us at this address. we’ve let your old address know too.'
            : res.reason === 'taken'
              ? 'that email is already used by another account, so nothing changed.'
              : 'it may have expired (links last an hour) or been used already. you can ask for a new one from your account.'}
        </p>
        <Button href="/account" size="lg" className="mt-7">
          go to your account
        </Button>
      </main>
    </div>
  );
}
