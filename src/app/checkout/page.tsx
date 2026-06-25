'use client';

import { IconArrowLeft, IconGift, IconHeart, IconLock, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import { CartLineItem } from '@/ui/components/CartLineItem';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';

const CART: { product: ProductKey; name: string; sub: string; price: string }[] = [
  { product: 'storybook', name: 'storybook', sub: '“Olivia’s big adventure”', price: '£24' },
  { product: 'framedPrint', name: 'framed print', sub: 'A4 · oak frame', price: '£22' },
];

const ADDONS: { product: ProductKey; name: string; price: string }[] = [
  { product: 'card', name: 'card', price: '£4' },
  { product: 'giftWrap', name: 'gift wrap', price: '£3' },
  { product: 'framedPrint', name: 'mini print', price: '£8' },
];

function OrderSummary() {
  return (
    <div className="rounded-2xl border border-[#EADFC9] bg-white p-4">
      <h2 className="font-display text-base font-semibold text-cocoa">Order summary</h2>
      <dl className="mt-3 space-y-2 text-[13px] text-[#5F564C]">
        <div className="flex justify-between">
          <dt>Subtotal</dt>
          <dd>£46.00</dd>
        </div>
        <div className="flex justify-between">
          <dt>Delivery</dt>
          <dd>£3.99</dd>
        </div>
        <div className="flex justify-between border-t border-[#EDE2CD] pt-2 text-base font-extrabold text-cocoa">
          <dt>Total</dt>
          <dd>£49.99</dd>
        </div>
      </dl>
      <Button size="lg" className="mt-4 w-full">
        checkout
      </Button>
      <p className="mt-3 text-center text-[11px] text-[#7A6A58]">
        <b>No account needed.</b> Checkout as a guest — perfect for grandparents.
      </p>
      <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#EAF1E4] px-2 py-2 text-[11px] text-green-save">
        <Icon icon={IconShieldCheck} size={14} /> Your data is yours. Nothing shared, ever.
      </p>
    </div>
  );
}

export default function CheckoutPage() {
  const [gift, setGift] = useState(true);

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-40 md:pb-0">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="flex items-center gap-3">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58] md:hidden" />
          <span className="hidden font-display text-xl font-semibold text-cocoa md:inline">snickerdoodle</span>
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-[#6F6358]">
          <Icon icon={IconLock} size={14} className="text-green-save" /> secure checkout
        </span>
      </header>

      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
        <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
          {/* Basket */}
          <div>
            <h1 className="font-display text-xl font-semibold text-cocoa">Olivia&apos;s basket</h1>
            <div className="mt-3 space-y-2.5">
              {CART.map((item) => (
                <CartLineItem key={item.name} product={item.product} name={item.name} sub={item.sub} price={item.price} />
              ))}
            </div>

            {/* Gift fork */}
            <div className="mt-3 rounded-2xl border border-dashed border-[#E2A86C] bg-[#FBEFE0] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-cocoa">
                  <Icon icon={IconGift} size={16} className="text-cinnamon" /> Sending this as a gift?
                </span>
                <Toggle on={gift} onChange={setGift} label="Send as a gift" />
              </div>
              {gift ? (
                <p className="mt-2 text-[11px] leading-relaxed text-[#8A6F52]">
                  We&apos;ll wrap it with a handwritten-style note and hide the prices.
                </p>
              ) : null}
              <Link href="/home" className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-bold text-cinnamon">
                <Icon icon={IconHeart} size={13} /> or add to a wishlist to share with family →
              </Link>
            </div>

            {/* Add-ons */}
            <p className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Add a little something</p>
            <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
              {ADDONS.map((a) => (
                <button
                  key={a.name}
                  type="button"
                  className="flex w-24 shrink-0 flex-col items-center rounded-xl border border-[#EFE6D6] bg-white p-2.5 text-center hover:border-honey"
                >
                  <ProductArt product={a.product} size={40} />
                  <span className="mt-1 text-[11px] font-bold text-cocoa">{a.name}</span>
                  <span className="text-[11px] text-[#9C8E7E]">{a.price}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Order summary (desktop) */}
          <aside className="hidden self-start md:block">
            <OrderSummary />
          </aside>
        </div>
      </main>

      {/* Mobile pinned total + checkout */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-[13px] text-[#6F6358]">
            Total <span className="text-[11px] text-[#9C8E7E]">incl. delivery</span>
          </span>
          <span className="text-base font-extrabold text-cocoa">£49.99</span>
        </div>
        <Button size="lg" className="w-full">
          checkout
        </Button>
        <p className="mt-2 text-center text-[11px] text-[#7A6A58]">
          <b>No account needed</b> — guest checkout, perfect for grandparents
        </p>
      </div>
    </div>
  );
}
