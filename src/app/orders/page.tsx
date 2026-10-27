import { IconArrowRight, IconBox, IconHelpCircle, IconPackage, IconTruck } from '@tabler/icons-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { getCurrentAccount } from '@/server/session';
import { getOrdersForAccount } from '@/server/orders';
import { CATALOGUE, formatPence, isCatalogueKey } from '@/pricing';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { CartLineItem } from '@/ui/components/CartLineItem';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';
import type { ProductKey } from '@/ui/components/ProductArt';

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'awaiting payment',
  PAID: 'being made',
  FULFILLING: 'being made',
  SHIPPED: 'on its way',
  CANCELLED: 'cancelled',
};

export default async function OrdersPage() {
  const account = await getCurrentAccount();
  if (!account) redirect('/login');
  const orders = await getOrdersForAccount(getDb(), account.id);

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <AppDesktopNav active="Orders" />

      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 py-6">
        <h1 className="pop-in flex items-center gap-2 font-display text-[30px] leading-tight text-cocoa md:text-4xl">
          <Icon icon={IconPackage} size={26} className="text-cinnamon" /> Your orders
        </h1>

        {orders.length === 0 ? (
          <div className="pop-in mt-10 flex flex-col items-center justify-center rounded-[22px] border-2 border-dashed border-cocoa/25 bg-paper px-6 py-14 text-center" style={{ ['--i' as string]: 1 }}>
            <div className="sticker flex h-16 w-16 -rotate-6 items-center justify-center rounded-full bg-honey">
              <Icon icon={IconBox} size={30} className="text-cocoa" />
            </div>
            <h2 className="mt-5 font-display text-xl text-cocoa">No orders yet</h2>
            <p className="mt-1 max-w-xs text-sm text-ink-soft">
              When you order something lovely, you&apos;ll be able to track it here.
            </p>
            <Button href="/start-creating" size="lg" className="mt-5">
              see the range →
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {orders.map((o, oi) => (
              <div key={o.ref} className="pop-in overflow-hidden rounded-[18px] border-2 border-cocoa bg-paper shadow-[0_3px_0_var(--color-cocoa)]" style={{ ['--i' as string]: Math.min(oi + 1, 8) }}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-cocoa/10 bg-honey-band px-4 py-2.5">
                  <span className="text-[13px] font-extrabold text-cocoa">Order {o.ref}</span>
                  <span className="sticker flex -rotate-2 items-center gap-1.5 rounded-pill bg-leaf-pale px-2.5 py-0.5 text-[11px] font-extrabold text-cocoa">
                    <Icon icon={IconTruck} size={13} /> {STATUS_LABEL[o.status] ?? o.status.toLowerCase()}
                  </span>
                </div>
                <div className="space-y-2 p-3">
                  {o.items.map((item, i) => (
                    <CartLineItem
                      key={`${o.ref}-${i}`}
                      product={item.productKey as ProductKey}
                      name={isCatalogueKey(item.productKey) ? CATALOGUE[item.productKey].label : item.productKey}
                      sub={item.qty > 1 ? `qty ${item.qty}` : undefined}
                      price={formatPence(item.linePence)}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between border-t-2 border-cocoa/10 px-4 py-2.5">
                  <span className="text-[13px] text-ink-soft">Total incl. delivery</span>
                  <span className="font-display text-lg text-cocoa">{formatPence(o.totalPence)}</span>
                </div>
                {o.status === 'SHIPPED' && (
                  <div className="border-t-2 border-cocoa/10 px-4 py-2.5 text-[14px] text-ink-soft">
                    {o.tracking?.url ? (
                      <a href={o.tracking.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 font-bold text-cinnamon underline underline-offset-2">
                        <Icon icon={IconTruck} size={16} /> track your parcel{o.tracking.carrier ? ` with ${o.tracking.carrier}` : ''}
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    ) : o.tracking?.number ? (
                      <p className="py-2">
                        Tracking number{o.tracking.carrier ? ` (${o.tracking.carrier})` : ''}: <span className="font-bold text-cocoa">{o.tracking.number}</span>
                      </p>
                    ) : (
                      <p className="py-2">Sent by standard post, so there&apos;s no tracking — it should be with you very soon.</p>
                    )}
                  </div>
                )}
                <div className="border-t-2 border-cocoa/10 px-4 py-1">
                  <Link
                    href={`/help?topic=${o.status === 'SHIPPED' ? 'order-problem' : o.status === 'PENDING' || o.status === 'CANCELLED' ? 'order-where' : 'order-change'}&order=${encodeURIComponent(o.ref)}#contact`}
                    className="inline-flex min-h-11 items-center gap-1.5 text-[14px] font-bold text-cinnamon"
                  >
                    <Icon icon={IconHelpCircle} size={16} /> need help with this order?
                  </Link>
                </div>
              </div>
            ))}
            <Link href="/start-creating" className="inline-flex min-h-11 items-center gap-1 text-sm font-bold text-cinnamon">
              keep creating <Icon icon={IconArrowRight} size={15} />
            </Link>
          </div>
        )}
      </main>

      <BottomTabBar tabs={APP_TABS} active="Orders" />
    </div>
  );
}
