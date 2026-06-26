'use client';

import { IconArrowLeft, IconGift, IconHeart, IconLock, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Toggle } from '@/ui/primitives/Toggle';
import { CartLineItem } from '@/ui/components/CartLineItem';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';
import {
  basketSubtotal,
  DELIVERY_PENCE,
  gbp,
  toast,
  useBasket,
  useOrders,
  type BasketItem,
} from '@/lib/store';

const ADDONS: { id: string; product: ProductKey; name: string; pricePence: number }[] = [
  { id: 'addon-card', product: 'card', name: 'card', pricePence: 400 },
  { id: 'addon-wrap', product: 'giftWrap', name: 'gift wrap', pricePence: 300 },
  { id: 'addon-mini', product: 'framedPrint', name: 'mini print', pricePence: 800 },
];

export default function CheckoutPage() {
  const items = useBasket((s) => s.items);
  const add = useBasket((s) => s.add);
  const remove = useBasket((s) => s.remove);
  const clear = useBasket((s) => s.clear);
  const addOrder = useOrders((s) => s.add);
  const router = useRouter();

  const [gift, setGift] = useState(false);
  const [email, setEmail] = useState('');

  const subtotal = basketSubtotal(items);
  const total = items.length ? subtotal + DELIVERY_PENCE : 0;
  const empty = items.length === 0;

  const placeOrder = () => {
    if (empty) return;
    const ref = `SNK-${Math.floor(100000 + (Date.now() % 900000))}`;
    addOrder({ id: ref, ref, items: [...items], totalPence: total });
    clear();
    router.push(`/checkout/confirmation?ref=${ref}`);
  };

  const summaryRows = (
    <dl className="mt-3 space-y-2 text-[13px] text-[#5F564C]">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{gbp(subtotal)}</dd>
      </div>
      <div className="flex justify-between">
        <dt>Delivery</dt>
        <dd>{gbp(DELIVERY_PENCE)}</dd>
      </div>
      <div className="flex justify-between border-t border-[#EDE2CD] pt-2 text-base font-extrabold text-cocoa">
        <dt>Total</dt>
        <dd>{gbp(total)}</dd>
      </div>
    </dl>
  );

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-40 md:pb-0">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/home" className="flex items-center gap-3">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58] md:hidden" />
          <span className="hidden font-display text-xl font-semibold text-cocoa md:inline">snickerdoodle</span>
        </Link>
        <span className="flex items-center gap-1.5 text-xs text-[#6F6358]">
          <Icon icon={IconLock} size={14} className="text-green-save" /> secure checkout
        </span>
      </header>

      {empty ? (
        // ── Empty basket ──
        <main id="main" className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#F3E8D6]">
            <Icon icon={IconShieldCheck} size={34} className="text-[#C9B79B]" />
          </div>
          <h1 className="mt-5 font-display text-2xl font-semibold text-cocoa">Your basket&apos;s empty</h1>
          <p className="mt-1.5 max-w-xs text-sm text-[#6F6358]">
            Pop a drawing on something lovely and it&apos;ll show up here.
          </p>
          <Button href="/catalogue" size="lg" className="mt-6">
            see the range →
          </Button>
        </main>
      ) : (
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-6 py-6">
          <div className="grid gap-6 md:grid-cols-[1.4fr_1fr]">
            {/* Basket */}
            <div>
              <h1 className="font-display text-xl font-semibold text-cocoa">Your basket</h1>
              <div className="mt-3 space-y-2.5">
                {items.map((item) => (
                  <CartLineItem
                    key={item.id}
                    product={item.product}
                    name={item.name}
                    sub={item.qty > 1 ? `qty ${item.qty}` : item.sub}
                    price={gift ? 'gift' : gbp(item.pricePence * item.qty)}
                    onRemove={() => remove(item.id)}
                  />
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
                  <div className="mt-2.5">
                    <p className="text-[11px] leading-relaxed text-[#8A6F52]">
                      We&apos;ll wrap it and tuck the prices away, so the only surprise is the lovely one.
                    </p>
                    <textarea
                      placeholder="add a little note (optional)"
                      rows={2}
                      className="mt-2 w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2 text-xs text-cocoa placeholder:text-[#A89B8C]"
                    />
                  </div>
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
                    key={a.id}
                    type="button"
                    onClick={() => {
                      add({ id: a.id, name: a.name, product: a.product, pricePence: a.pricePence });
                      toast(`${a.name} added`);
                    }}
                    className="flex w-24 shrink-0 flex-col items-center rounded-xl border border-[#EFE6D6] bg-white p-2.5 text-center hover:border-honey"
                  >
                    <ProductArt product={a.product} size={40} />
                    <span className="mt-1 text-[11px] font-bold text-cocoa">{a.name}</span>
                    <span className="text-[11px] text-[#9C8E7E]">{gbp(a.pricePence)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Order summary (desktop) */}
            <aside className="hidden self-start md:block">
              <div className="rounded-2xl border border-[#EADFC9] bg-white p-4">
                <h2 className="font-display text-base font-semibold text-cocoa">Order summary</h2>
                {summaryRows}
                <label htmlFor="email-d" className="mt-4 block text-[11px] font-bold text-[#6F6358]">
                  email for your receipt
                </label>
                <input
                  id="email-d"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-1 w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2.5 text-xs text-cocoa placeholder:text-[#A89B8C]"
                />
                <Button size="lg" className="mt-3 w-full" onClick={placeOrder}>
                  checkout
                </Button>
                <p className="mt-3 text-center text-[11px] text-[#7A6A58]">
                  <b>No account needed.</b> Checkout as a guest — or{' '}
                  <Link href="/login" className="font-bold text-cinnamon">
                    log in
                  </Link>
                  .
                </p>
                <p className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#EAF1E4] px-2 py-2 text-[11px] text-green-save">
                  <Icon icon={IconShieldCheck} size={14} /> Your data is yours. Nothing shared, ever.
                </p>
              </div>
            </aside>
          </div>
        </main>
      )}

      {/* Mobile pinned total + checkout */}
      {!empty ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-[13px] text-[#6F6358]">
              Total <span className="text-[11px] text-[#9C8E7E]">incl. delivery</span>
            </span>
            <span className="text-base font-extrabold text-cocoa">{gbp(total)}</span>
          </div>
          <Button size="lg" className="w-full" onClick={placeOrder}>
            checkout
          </Button>
          <p className="mt-2 text-center text-[11px] text-[#7A6A58]">
            <b>No account needed</b> — guest checkout, perfect for grandparents
          </p>
        </div>
      ) : null}
    </div>
  );
}
