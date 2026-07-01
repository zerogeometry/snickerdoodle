'use client';

import { IconShieldCheck, IconUsersPlus } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { ProductArt, type ProductKey } from '@/ui/components/ProductArt';
import { DELIVERY_PENCE, gbp, useBasket, type BasketItem } from '@/lib/store';

interface GiftItem {
  assetId: string;
  productKey: string;
  label: string;
  unitPricePence: number;
  imageUrl: string | null;
}

export function GiftCheckout({
  token,
  items,
  inviteToken,
  familyName,
}: {
  token: string;
  items: GiftItem[];
  inviteToken: string | null;
  familyName: string;
}) {
  const router = useRouter();
  const seed = useBasket((s) => s.seed);

  const subtotal = items.reduce((n, i) => n + i.unitPricePence, 0);
  const total = subtotal + DELIVERY_PENCE;

  const toCheckout = () => {
    const lineItems: Omit<BasketItem, 'qty'>[] = items.map((i) => ({
      id: `gift-${i.assetId}`,
      name: i.label,
      product: i.productKey as ProductKey,
      pricePence: i.unitPricePence,
    }));
    seed(lineItems);
    router.push('/checkout'); // server re-prices; a joined member earns the 5%
  };

  return (
    <div className="grid gap-6 md:grid-cols-[1.35fr_1fr]">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Ready to give</p>
        <div className="mt-2 space-y-2.5">
          {items.map((item) => (
            <div key={item.assetId} className="flex items-center gap-3 rounded-xl border border-[#EADFC9] bg-white px-3 py-2.5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[#EADFC9] bg-oat">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ProductArt product={item.productKey as ProductKey} size={30} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold text-cocoa">{item.label}</div>
                <div className="text-[11px] text-[#9C8E7E]">a keepsake from {familyName}</div>
              </div>
              <span className="text-[13px] font-bold text-cocoa">{gbp(item.unitPricePence)}</span>
            </div>
          ))}
        </div>
      </div>

      <aside className="self-start rounded-2xl border border-[#EADFC9] bg-white p-4">
        <dl className="space-y-1.5 text-[13px] text-[#5F564C]">
          <div className="flex justify-between">
            <dt>
              {items.length} {items.length === 1 ? 'gift' : 'gifts'}
            </dt>
            <dd>{gbp(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Delivery</dt>
            <dd>{DELIVERY_PENCE === 0 ? <span className="font-semibold text-green-save">Free</span> : gbp(DELIVERY_PENCE)}</dd>
          </div>
          <div className="flex justify-between border-t border-[#EDE2CD] pt-1.5 text-[15px] font-extrabold text-cocoa">
            <dt>Total</dt>
            <dd>{gbp(total)}</dd>
          </div>
        </dl>

        {inviteToken ? (
          <div className="mt-3 rounded-xl border border-[#F0CF9C] bg-honey-band p-3 text-center">
            <span className="flex items-center justify-center gap-1.5 text-[11px] font-bold text-[#7A5B33]">
              <Icon icon={IconUsersPlus} size={14} className="text-cinnamon" /> Invited to join the family
            </span>
            <Button href={`/join/${inviteToken}`} size="md" className="mt-2 w-full">
              join the family · 5% off
            </Button>
            <p className="mt-1.5 text-[11px] text-[#9C8772]">then check out with your saving applied</p>
            <p className="my-2.5 text-[11px] text-[#B3A491]">— or —</p>
          </div>
        ) : null}

        <Button variant={inviteToken ? 'secondary' : 'primary'} size="lg" className="mt-3 w-full" onClick={toCheckout}>
          checkout as guest
        </Button>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-green-save">
          <Icon icon={IconShieldCheck} size={13} /> Secure — your details are never shared.
        </p>
        <p className="mt-2 text-center text-[11px] text-[#9C8772]">
          <Link href="/" className="hover:text-cinnamon">
            about snickerdoodle
          </Link>
        </p>
      </aside>
    </div>
  );
}
