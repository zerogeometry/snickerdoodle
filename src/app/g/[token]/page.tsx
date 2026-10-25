import { IconAlertTriangle, IconGift, IconLock, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getDb } from '@/db/client';
import { getGiftLink } from '@/server/giftLinks';
import { getCatalogue } from '@/server/catalogue';
import { resolveSessionJoinProvenance } from '@/server/joinProvenance';
import { quote } from '@/pricing';
import { getCurrentAccount } from '@/server/session';
import { screenFromName } from '@/server/giftLinks';
import { Icon } from '@/ui/primitives/Icon';
import { GiftCheckout } from './GiftCheckout';
import { ReportGiftLink } from './ReportGiftLink';

// Gift links are private, unguessable and never indexed (docs/05).
export const metadata: Metadata = {
  title: 'a gift list',
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center justify-between border-b border-line px-6 py-3">
        <Link href="/" className="font-display text-lg font-semibold text-cocoa">
          snickerdoodle
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-ink-soft">
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
  gone: { title: 'This gift list is no longer available', body: 'One of these keepsakes isn’t available any more. Ask the family if you’d like a fresh link.' },
};

export default async function GiftLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const view = await getGiftLink(getDb(), token);

  if (view.state !== 'active') {
    const msg = UNAVAILABLE[view.state] ?? UNAVAILABLE['not-found']!;
    return (
      <Shell>
        <main id="main" className="flex flex-1 items-center justify-center px-6 py-16">
          <div className="max-w-sm rounded-2xl border border-line bg-white p-7 text-center">
            <Icon icon={IconAlertTriangle} size={28} className="mx-auto text-honey" />
            <h1 className="mt-3 font-display text-xl font-semibold text-cocoa">{msg.title}</h1>
            <p className="mt-2 text-sm text-ink-soft">{msg.body}</p>
          </div>
        </main>
      </Shell>
    );
  }

  // Totals are the SERVER's quote for this viewer — the same engine placeGiftLinkOrder
  // charges with. A buyer who joined via this family's invite sees their 5% here.
  const db = getDb();
  const provenance = await resolveSessionJoinProvenance();
  const joinProvenance = provenance?.invite?.familyId === view.familyId ? provenance : null;
  const q = quote(
    view.items.filter((i) => !i.purchased).map((i) => ({ productKey: i.productKey, qty: 1 })), // ticked-off items aren't sold again
    { gift: true, joinProvenance, catalogue: await getCatalogue(db) },
  );
  const pricing = { subtotalPence: q.subtotalPence, deliveryPence: q.deliveryPence, joinSavingPence: q.joinSavingPence, totalPence: q.totalPence };
  const viewer = await getCurrentAccount();
  const defaultFrom = viewer ? (screenFromName(viewer.name) ?? screenFromName(viewer.email.split('@')[0]) ?? '') : '';

  return (
    <Shell>
      {/* the list's title band and the list itself are the page's main content */}
      <main id="main" className="flex flex-1 flex-col">
      <div className="flex items-center gap-3.5 bg-honey-band px-6 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-honey bg-paper">
          <Icon icon={IconGift} size={24} className="text-cinnamon" />
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold leading-tight text-cocoa">
            {view.title ?? (view.familyName ? `A gift list from ${view.familyName}` : 'A little gift list for you')}
          </h1>
          <p className="text-[11px] text-ink-faint">A ready-to-buy cart — check out and it&apos;s on its way.</p>
        </div>
      </div>

      <div className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <GiftCheckout
          token={token}
          items={view.items.map(({ assetId, productKey, label, unitPricePence, imageUrl, purchased }) => ({ assetId, productKey, label, unitPricePence, imageUrl, purchased }))}
          defaultFrom={defaultFrom}
          inviteToken={view.inviteToken}
          familyName={view.familyName}
          pricing={pricing}
        />
      </div>
      </main>

      <footer className="flex flex-col items-center justify-center gap-0.5 bg-paper-2 px-6 py-2 text-center">
        <span className="flex items-center gap-1.5 text-[11px] text-green-save">
          <Icon icon={IconShieldCheck} size={14} /> Secure. Your details are yours — never shared, never sold.
        </span>
        <ReportGiftLink token={token} />
      </footer>
    </Shell>
  );
}
