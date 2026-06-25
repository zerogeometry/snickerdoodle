import { IconGift, IconLock, IconMail, IconShieldCheck, IconUsersPlus } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { CartLineItem } from '@/ui/components/CartLineItem';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';

// Gift links are private, unguessable and never indexed (docs/05).
export const metadata: Metadata = {
  title: 'a gift list for Olivia',
  robots: { index: false, follow: false },
};

const ITEMS: { product: ProductKey; name: string; sub: string; price: string }[] = [
  { product: 'storybook', name: "Olivia's storybook", sub: '“Olivia’s big adventure”', price: '£24' },
  { product: 'framedPrint', name: 'Framed "Our house" print', sub: 'A4 · oak frame', price: '£22' },
];

const ADDONS: { product: ProductKey; name: string; price: string }[] = [
  { product: 'card', name: 'card', price: '£4' },
  { product: 'giftWrap', name: 'gift wrap', price: '£3' },
  { product: 'framedPrint', name: 'mini print', price: '£8' },
];

export default function GiftLinkPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3">
        <span className="font-display text-lg font-semibold text-cocoa">snickerdoodle</span>
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
        <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
          {/* Ready to give */}
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Ready to give</p>
            <div className="mt-2 space-y-2.5">
              {ITEMS.map((item) => (
                <CartLineItem key={item.name} product={item.product} name={item.name} sub={item.sub} price={item.price} />
              ))}
            </div>

            <div className="mt-3 rounded-xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-3">
              <p className="text-[11px] font-bold text-[#7A6A58]">add a little something?</p>
              <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
                {ADDONS.map((a) => (
                  <button
                    key={a.name}
                    type="button"
                    className="flex w-[88px] shrink-0 flex-col items-center rounded-lg border border-[#EFE6D6] bg-white p-2 text-center hover:border-honey"
                  >
                    <ProductArt product={a.product} size={36} />
                    <span className="mt-1 text-[11px] font-bold text-cocoa">{a.name}</span>
                    <span className="text-[11px] text-[#9C8E7E]">{a.price}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary + join/guest */}
          <aside className="self-start rounded-2xl border border-[#EADFC9] bg-white p-4">
            <dl className="space-y-1.5 text-[13px] text-[#5F564C]">
              <div className="flex justify-between">
                <dt>2 gifts</dt>
                <dd>£46.00</dd>
              </div>
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd>£3.99</dd>
              </div>
              <div className="flex justify-between border-t border-[#EDE2CD] pt-1.5 text-[15px] font-extrabold text-cocoa">
                <dt>Total</dt>
                <dd>£49.99</dd>
              </div>
            </dl>

            {/* Join family */}
            <div className="mt-3 rounded-xl border border-[#F0CF9C] bg-honey-band p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-bold leading-tight text-[#7A5B33]">
                  <Icon icon={IconUsersPlus} size={14} className="shrink-0 text-cinnamon" /> Sam invited you to join the Hartley
                  family
                </span>
                <span className="shrink-0 whitespace-nowrap rounded-full bg-green-save px-2 py-1 text-[11px] font-extrabold text-oat">
                  save 5% · £2.40 off
                </span>
              </div>
              <input
                type="email"
                placeholder="your email"
                className="mt-2.5 w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2.5 text-xs text-cocoa placeholder:text-[#A89B8C]"
              />
              <Button size="md" className="mt-2 w-full">
                join family &amp; checkout
              </Button>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-[#9C8772]">
                <Icon icon={IconMail} size={12} /> We&apos;ll email a quick link to verify it&apos;s you.
              </p>
            </div>

            <p className="my-2.5 text-center text-[11px] text-[#B3A491]">— or —</p>
            <Button href="/checkout" variant="secondary" size="md" className="w-full">
              checkout as guest
            </Button>
          </aside>
        </div>
      </main>

      <div className="flex items-center justify-center gap-1.5 bg-[#F1E7D4] px-6 py-2.5 text-center text-[11px] text-green-save">
        <Icon icon={IconShieldCheck} size={14} /> Secure. Your details are yours — never shared, never sold.
      </div>
    </div>
  );
}
