import { IconAlertTriangle, IconGift, IconLock, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getDb } from '@/db/client';
import { getGiftLink } from '@/server/giftLinks';
import { Icon } from '@/ui/primitives/Icon';
import { GiftCheckout } from './GiftCheckout';

// Gift links are private, unguessable and never indexed (docs/05).
export const metadata: Metadata = {
  title: 'a gift list',
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3">
        <Link href="/" className="font-display text-lg font-semibold text-cocoa">
          snickerdoodle
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-[#6F6358]">
          <Icon icon={IconLock} size={14} className="text-green-save" /> secure gift link
        </span>
      </header>
      {children}
    </div>
  );
}

const UNAVAILABLE: Record<string, { title: string; body: string }> = {
  'not-found': { title: "This gift link isn't valid", body: 'It may have been mistyped. Ask whoever shared it to send a fresh one.' },
  revoked: { title: 'This gift list was turned off', body: 'The family switched this link off. Ask them for a new one if you still need it.' },
  expired: { title: 'This gift list has expired', body: 'Gift links don’t last forever. Ask the family to share a fresh one.' },
  gone: { title: 'This gift list is no longer available', body: 'One of these keepsakes was removed by the family.' },
};

export default async function GiftLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getGiftLink(getDb(), token);

  if (view.state !== 'active') {
    const msg = UNAVAILABLE[view.state] ?? UNAVAILABLE['not-found']!;
    return (
      <Shell>
        <main id="main" className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="max-w-sm rounded-2xl border border-[#EADFC9] bg-white p-7 text-center">
            <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-honey" />
            <h1 className="mt-3 font-display text-xl font-semibold text-cocoa">{msg.title}</h1>
            <p className="mt-2 text-sm text-[#6F6358]">{msg.body}</p>
          </div>
        </main>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center gap-3.5 bg-honey-band px-6 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-honey bg-[#FFFDF8]">
          <Icon icon={IconGift} size={24} className="text-cinnamon" />
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold leading-tight text-cocoa">
            {view.title ?? `A gift list from ${view.familyName}`}
          </h1>
          <p className="text-[11px] text-[#8A6F52]">A ready-to-buy cart — check out and it&apos;s on its way.</p>
        </div>
      </div>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <GiftCheckout token={token} items={view.items} inviteToken={view.inviteToken} familyName={view.familyName} />
      </main>

      <div className="flex items-center justify-center gap-1.5 bg-[#F1E7D4] px-6 py-2.5 text-center text-[11px] text-green-save">
        <Icon icon={IconShieldCheck} size={14} /> Secure. Your details are yours — never shared, never sold.
      </div>
    </Shell>
  );
}
