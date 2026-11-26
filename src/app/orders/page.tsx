import { IconArrowRight, IconBox, IconPackage } from '@tabler/icons-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getDb } from '@/db/client';
import { getCurrentAccount } from '@/server/session';
import { getOrdersForAccount } from '@/server/orders';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { OrderTile } from '@/ui/components/OrderTile';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { AppDesktopNav } from '@/ui/components/AppDesktopNav';
import { APP_TABS } from '@/ui/components/appTabs';

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
            {/* one tile per order, all closed until tapped (founder, 26 Nov 2026) */}
            {orders.map((o, oi) => (
              <OrderTile key={o.ref} order={o} index={oi} open={false} />
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
