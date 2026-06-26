'use client';

import { IconCheck, IconMail, IconShieldCheck, IconUsersPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { CartLineItem } from '@/ui/components/CartLineItem';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';
import { basketSubtotal, DELIVERY_PENCE, gbp, toast, useBasket, type BasketItem } from '@/lib/store';

type GiftItem = { id: string; product: ProductKey; name: string; sub: string; pricePence: number };
type Addon = { id: string; product: ProductKey; name: string; pricePence: number };

export function GiftCheckout({ items, addons }: { items: GiftItem[]; addons: Addon[] }) {
  const router = useRouter();
  const seed = useBasket((s) => s.seed);
  const [picked, setPicked] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const selectedAddons = addons.filter((a) => picked.includes(a.id));
  const lineItems: Omit<BasketItem, 'qty'>[] = [
    ...items.map((i) => ({ id: i.id, name: i.name, product: i.product, pricePence: i.pricePence, sub: i.sub })),
    ...selectedAddons.map((a) => ({ id: a.id, name: a.name, product: a.product, pricePence: a.pricePence })),
  ];
  const subtotal = useMemo(
    () => basketSubtotal(lineItems.map((i) => ({ ...i, qty: 1 }))),
    [lineItems],
  );
  const total = subtotal + DELIVERY_PENCE;

  const toCheckout = () => {
    seed(lineItems);
    router.push('/checkout');
  };

  const joinAndCheckout = () => {
    if (!email.trim()) {
      toast('pop in your email first');
      return;
    }
    // Parent-initiated invite → recipient verifies identity by email (no self-join).
    setSent(true);
    toast("we've emailed a link to verify it's you");
    seed(lineItems);
    setTimeout(() => router.push('/checkout'), 900);
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
      {/* Ready to give */}
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Ready to give</p>
        <div className="mt-2 space-y-2.5">
          {items.map((item) => (
            <CartLineItem key={item.id} product={item.product} name={item.name} sub={item.sub} price={gbp(item.pricePence)} />
          ))}
        </div>

        <div className="mt-3 rounded-xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-3">
          <p className="text-[11px] font-bold text-[#7A6A58]">add a little something?</p>
          <div className="mt-2 flex gap-2.5 overflow-x-auto pb-1">
            {addons.map((a) => {
              const on = picked.includes(a.id);
              return (
                <button
                  key={a.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setPicked((p) => (on ? p.filter((x) => x !== a.id) : [...p, a.id]))}
                  className={`relative flex w-[88px] shrink-0 flex-col items-center rounded-lg border bg-white p-2 text-center ${
                    on ? 'border-cinnamon ring-1 ring-cinnamon' : 'border-[#EFE6D6] hover:border-honey'
                  }`}
                >
                  {on ? (
                    <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-cinnamon text-cta-text">
                      <Icon icon={IconCheck} size={11} />
                    </span>
                  ) : null}
                  <ProductArt product={a.product} size={36} />
                  <span className="mt-1 text-[11px] font-bold text-cocoa">{a.name}</span>
                  <span className="text-[11px] text-[#9C8E7E]">{gbp(a.pricePence)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Summary + join/guest */}
      <aside className="self-start rounded-2xl border border-[#EADFC9] bg-white p-4">
        <dl className="space-y-1.5 text-[13px] text-[#5F564C]">
          <div className="flex justify-between">
            <dt>
              {items.length + selectedAddons.length} {items.length + selectedAddons.length === 1 ? 'gift' : 'gifts'}
            </dt>
            <dd>{gbp(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd>{gbp(DELIVERY_PENCE)}</dd>
          </div>
          <div className="flex justify-between border-t border-[#EDE2CD] pt-1.5 text-[15px] font-extrabold text-cocoa">
            <dt>Total</dt>
            <dd>{gbp(total)}</dd>
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
              save 5%
            </span>
          </div>
          {sent ? (
            <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-[#EAF1E4] px-2.5 py-2 text-[11px] font-semibold text-green-save">
              <Icon icon={IconMail} size={13} /> Check your email for a link to verify it&apos;s you.
            </p>
          ) : (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your email"
                className="mt-2.5 w-full rounded-lg border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2.5 text-xs text-cocoa placeholder:text-[#A89B8C]"
              />
              <Button size="md" className="mt-2 w-full" onClick={joinAndCheckout}>
                join family &amp; checkout
              </Button>
              <p className="mt-1.5 flex items-center justify-center gap-1 text-[11px] text-[#9C8772]">
                <Icon icon={IconMail} size={12} /> We&apos;ll email a quick link to verify it&apos;s you.
              </p>
            </>
          )}
        </div>

        <p className="my-2.5 text-center text-[11px] text-[#B3A491]">— or —</p>
        <Button variant="secondary" size="md" className="w-full" onClick={toCheckout}>
          checkout as guest
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-green-save">
          <Icon icon={IconShieldCheck} size={13} /> Secure — your details are never shared.
        </p>
      </aside>
    </div>
  );
}
