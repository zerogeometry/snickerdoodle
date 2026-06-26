import { IconArrowRight, IconBox, IconPackage, IconTruck } from '@tabler/icons-react';
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
        <h1 className="flex items-center gap-2 font-display text-2xl font-semibold text-cocoa">
          <Icon icon={IconPackage} size={22} className="text-cinnamon" /> Your orders
        </h1>

        {orders.length === 0 ? (
          <div className="mt-10 flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] px-6 py-14 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#F3E8D6]">
              <Icon icon={IconBox} size={30} className="text-[#C9B79B]" />
            </div>
            <h2 className="mt-4 font-display text-lg font-semibold text-cocoa">No orders yet</h2>
            <p className="mt-1 max-w-xs text-sm text-[#6F6358]">
              When you order something lovely, you&apos;ll be able to track it here.
            </p>
            <Button href="/catalogue" size="lg" className="mt-5">
              see the range →
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {orders.map((o) => (
              <div key={o.ref} className="overflow-hidden rounded-2xl border border-[#EADFC9] bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EFE6D6] bg-[#FBF8F1] px-4 py-2.5">
                  <span className="text-[13px] font-bold text-cocoa">Order {o.ref}</span>
                  <span className="flex items-center gap-1.5 rounded-full bg-[#EAF1E4] px-2.5 py-1 text-[11px] font-bold text-green-save">
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
                <div className="flex items-center justify-between border-t border-[#EFE6D6] px-4 py-2.5">
                  <span className="text-[13px] text-[#6F6358]">Total incl. delivery</span>
                  <span className="text-[15px] font-extrabold text-cocoa">{formatPence(o.totalPence)}</span>
                </div>
              </div>
            ))}
            <Link href="/catalogue" className="inline-flex items-center gap-1 text-sm font-bold text-cinnamon">
              keep creating <Icon icon={IconArrowRight} size={15} />
            </Link>
          </div>
        )}
      </main>

      <BottomTabBar tabs={APP_TABS} active="Orders" />
    </div>
  );
}
