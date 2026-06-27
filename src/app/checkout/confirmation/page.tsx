'use client';

import { IconCircleCheck, IconHeart, IconMail } from '@tabler/icons-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { CaveatNote } from '@/ui/primitives/CaveatNote';

function Confirmation() {
  const ref = useSearchParams().get('ref') ?? 'SNK-000000';
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EAF1E4]">
        <Icon icon={IconCircleCheck} size={40} className="text-green-save" />
      </div>
      <CaveatNote className="mt-5 text-2xl text-cinnamon">hooray!</CaveatNote>
      <h1 className="mt-1 font-display text-3xl font-semibold text-cocoa">Your order&apos;s on its way</h1>
      <p className="mt-2 max-w-sm text-sm text-[#6F6358]">
        We&apos;re making your bits with love. You&apos;ll get an email the moment they&apos;re on the move.
      </p>
      <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[#F3E8D6] px-3 py-1.5 text-xs font-bold text-cocoa">
        <Icon icon={IconMail} size={14} className="text-cinnamon" /> order {ref}
      </p>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
        <Button href="/home?new=1" size="lg">
          <Icon icon={IconHeart} size={16} /> go to your keepsake home
        </Button>
        <Button href="/catalogue" variant="secondary" size="lg">
          keep creating
        </Button>
      </div>
      <p className="mt-6 text-[11px] text-[#9C8772]">
        This is a preview checkout — no payment was taken.
      </p>
    </main>
  );
}

export default function ConfirmationPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
      </header>
      <Suspense>
        <Confirmation />
      </Suspense>
    </div>
  );
}
