import { IconCircleCheck, IconHeart, IconMail } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { isStripeConfigured } from '@/payments/stripe';
import { getCurrentAccount } from '@/server/session';
import { getDb } from '@/db/client';
import { listUndecidedCreations } from '@/server/keepChoice';
import { KeepChoiceCard } from './KeepChoiceCard';

export const metadata: Metadata = { title: 'thank you', robots: { index: false, follow: false } };

/**
 * Order confirmation. Server-rendered so what it says is TRUE: the "preview — no payment"
 * note only appears when there genuinely is no payment provider (local dev fallback), and a
 * guest (e.g. a grandparent buying from a gift link) isn't sent to a keepsake home they
 * don't have.
 */
export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const raw = (await searchParams).ref;
  const ref = typeof raw === 'string' && /^SNK-\d{6}$/.test(raw) ? raw : null;
  const account = await getCurrentAccount();
  const preview = !isStripeConfigured();
  // The buyer's own drawings on this order that aren't kept yet → ask "keep these?"
  const undecided = account && ref ? await listUndecidedCreations(getDb(), account.id, ref) : [];

  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="border-b border-line px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
      </header>
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-leaf-pale">
          <Icon icon={IconCircleCheck} size={40} className="text-green-save" />
        </div>
        <CaveatNote className="mt-5 text-2xl text-cinnamon">hooray!</CaveatNote>
        <h1 className="mt-1 font-display text-3xl font-semibold text-cocoa">Thank you — it&apos;s being made</h1>
        <p className="mt-2 max-w-sm text-sm text-ink-soft">
          We&apos;re making your bits with love. You&apos;ll get an email the moment they&apos;re on the move.
        </p>
        {ref ? (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-paper-2 px-3 py-1.5 text-xs font-bold text-cocoa">
            <Icon icon={IconMail} size={14} className="text-cinnamon" /> order {ref}
          </p>
        ) : null}
        {ref && undecided.length > 0 ? <KeepChoiceCard orderRef={ref} creations={undecided} /> : null}
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          {account ? (
            <Button href="/home?new=1" size="lg">
              <Icon icon={IconHeart} size={16} /> go to your keepsake home
            </Button>
          ) : null}
          <Button href="/start-creating" variant={account ? 'secondary' : 'primary'} size="lg">
            {account ? 'keep creating' : 'make something of your own'}
          </Button>
        </div>
        {preview ? (
          <p className="mt-6 text-[11px] text-ink-soft">This is a preview checkout — no payment was taken.</p>
        ) : null}
      </main>
    </div>
  );
}
