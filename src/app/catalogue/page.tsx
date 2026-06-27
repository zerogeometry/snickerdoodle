'use client';

import { IconArrowLeft } from '@tabler/icons-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { BasketButton } from '@/ui/components/BasketButton';
import { FlowCatalogue } from '@/ui/components/FlowCatalogue';
import { useUpload } from '@/lib/store';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

export default function CataloguePage() {
  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const upload = useUpload((s) => s.upload);

  useEffect(() => {
    void loadCatalogueAction().then(setProducts);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-10">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <Link href="/start-creating" aria-label="Back to your drawing">
            <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
          </Link>
          <Link href="/" className="font-display text-xl font-semibold text-cocoa">snickerdoodle</Link>
        </div>
        <BasketButton />
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <h1 className="font-display text-2xl font-semibold md:text-3xl">
          {upload ? 'Your artwork' : 'Any drawing'}, on a <span className="text-cinnamon">whole family range</span>.
        </h1>
        <p className="mt-1 text-sm text-[#6F6358]">
          {upload ? 'Tap + to add, or customize for size, colour & placement.' : 'Upload a drawing and watch it land on everything.'}
        </p>

        <div className="mt-5">
          {products ? (
            <FlowCatalogue products={products} showCategories />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-48 animate-pulse rounded-2xl border border-[#EADFC9] bg-[#FBF5E9]" />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
