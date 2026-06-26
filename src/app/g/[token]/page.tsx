import { IconGift, IconLock, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Icon } from '@/ui/primitives/Icon';
import type { ProductKey } from '@/ui/components/ProductArt';
import { GiftCheckout } from './GiftCheckout';

// Gift links are private, unguessable and never indexed (docs/05).
export const metadata: Metadata = {
  title: 'a gift list for Olivia',
  robots: { index: false, follow: false },
};

const ITEMS: { id: string; product: ProductKey; name: string; sub: string; pricePence: number }[] = [
  { id: 'gift-storybook', product: 'storybook', name: "Olivia's storybook", sub: '“Olivia’s big adventure”', pricePence: 2400 },
  { id: 'gift-print', product: 'framedPrint', name: 'Framed "Our house" print', sub: 'A4 · oak frame', pricePence: 2200 },
];

const ADDONS: { id: string; product: ProductKey; name: string; pricePence: number }[] = [
  { id: 'gift-addon-card', product: 'card', name: 'card', pricePence: 400 },
  { id: 'gift-addon-wrap', product: 'giftWrap', name: 'gift wrap', pricePence: 300 },
  { id: 'gift-addon-mini', product: 'framedPrint', name: 'mini print', pricePence: 800 },
];

export default function GiftLinkPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3">
        <Link href="/" className="font-display text-lg font-semibold text-cocoa">
          snickerdoodle
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-[#6F6358]">
          <Icon icon={IconLock} size={14} className="text-green-save" /> secure · a gift link from the Hartleys
        </span>
      </header>

      {/* Warm gift header */}
      <div className="flex items-center gap-3.5 bg-honey-band px-6 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border-2 border-honey bg-[#FFFDF8]">
          <Icon icon={IconGift} size={24} className="text-cinnamon" />
        </div>
        <div>
          <h1 className="font-display text-lg font-semibold leading-tight text-cocoa">
            A gift list for Olivia&apos;s 6th birthday
          </h1>
          <p className="text-[11px] text-[#8A6F52]">
            Sam&apos;s set up a cart for you — just check out and it&apos;s on its way.
          </p>
          <p className="font-hand text-[15px] text-cinnamon">“Anything here would make her year! — Sam x”</p>
        </div>
      </div>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <GiftCheckout items={ITEMS} addons={ADDONS} />
      </main>

      <div className="flex items-center justify-center gap-1.5 bg-[#F1E7D4] px-6 py-2.5 text-center text-[11px] text-green-save">
        <Icon icon={IconShieldCheck} size={14} /> Secure. Your details are yours — never shared, never sold.
      </div>
    </div>
  );
}
