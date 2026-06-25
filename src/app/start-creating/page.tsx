import { IconLock } from '@tabler/icons-react';
import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { PlaceholderDoodle } from '@/ui/components/PlaceholderDoodle';
import { ProductCard } from '@/ui/components/ProductCard';
import type { ProductKey } from '@/ui/components/ProductArt';

export const metadata: Metadata = {
  title: 'start creating',
  robots: { index: false },
};

const RANGE: { name: string; price: string; product: ProductKey; featured?: boolean }[] = [
  { name: 'framed print', price: '£22', product: 'framedPrint' },
  { name: 'mug', price: '£14', product: 'mug' },
  { name: 'kids tee', price: '£18', product: 'kidsTee' },
  { name: 'cushion', price: '£28', product: 'cushion' },
  { name: 'tote bag', price: '£16', product: 'toteBag' },
  { name: 'storybook ✦', price: '£24', product: 'storybook', featured: true },
];

function Breadcrumb() {
  return (
    <span className="text-xs text-[#A89B8C]">
      upload · <b className="text-cinnamon">your range</b> · save
    </span>
  );
}

export default function StartCreatingPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
        <Breadcrumb />
      </header>

      <main id="main" className="flex-1 pb-28 md:pb-0">
        <div className="mx-auto grid max-w-5xl gap-8 px-6 py-10 md:grid-cols-[0.85fr_1.15fr] md:items-center md:py-14">
          {/* You uploaded */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[#6F6358]">you uploaded</p>
            <PlaceholderDoodle size={150} />
            <p className="mt-2 font-hand text-[17px] text-[#6F6358]">Olivia, age 5</p>
            <div className="mt-4 flex items-start gap-2.5 rounded-xl bg-[#EAF1E4] p-3">
              <Icon icon={IconLock} size={16} className="mt-0.5 shrink-0 text-green-save" />
              <p className="text-[13px] leading-relaxed text-[#46402F]">
                <b>This stays yours. Always.</b> We use it to make your bits, then it&apos;s gone — unless you keep it.
              </p>
            </div>
          </div>

          {/* Made real */}
          <div>
            <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">
              Here&apos;s Olivia&apos;s masterpiece, made real.
            </h1>
            <p className="mt-2 text-sm text-[#6F6358]">The same drawing, ready on everything you love.</p>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {RANGE.map((item) => (
                <ProductCard
                  key={item.name}
                  name={item.name}
                  price={item.price}
                  product={item.product}
                  featured={item.featured}
                />
              ))}
            </div>

            <div className="mt-7 hidden flex-wrap gap-3 md:flex">
              <Button href="/catalogue" size="lg">
                see the full range →
              </Button>
              <Button href="/studio" variant="secondary" size="lg">
                open in studio
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Mobile: primary action pinned to the thumb zone */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#EFE6D6] bg-oat px-4 pb-5 pt-3 md:hidden">
        <Button href="/catalogue" size="lg" className="w-full">
          see the full range →
        </Button>
        <div className="mt-1.5 text-center">
          <Button href="/studio" variant="ghost" size="sm">
            open in studio
          </Button>
        </div>
      </div>
    </div>
  );
}
