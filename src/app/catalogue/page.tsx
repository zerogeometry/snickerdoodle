'use client';

import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { BasketButton } from '@/ui/components/BasketButton';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { TileSkeletonGrid } from '@/ui/components/TileSkeleton';
import { FlowCatalogue } from '@/ui/components/FlowCatalogue';
import { useUpload } from '@/lib/store';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import type { CatalogueProduct } from '@/server/catalogue';

export default function CataloguePage() {
  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const upload = useUpload((s) => s.upload);

  const load = () => {
    setLoadError(false);
    void loadCatalogueAction()
      .then(setProducts)
      .catch(() => setLoadError(true));
  };
  useEffect(load, []);

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-10">
      <FlowHeader back={{ href: '/start-creating', label: 'Back to your drawing' }} right={<BasketButton />} />

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6">
        <h1 className="pop-in font-display text-[28px] leading-tight md:text-4xl">
          {upload ? 'Your artwork' : 'Any drawing'}, on a <span className="text-cinnamon">whole family range</span>.
        </h1>
        <p className="pop-in mt-1 text-sm text-ink-soft" style={{ ['--i' as string]: 1 }}>
          {upload ? 'Tap + to add, or customize for size, colour & placement.' : 'Upload a drawing and watch it land on everything.'}
        </p>

        <div className="mt-5">
          {loadError ? (
            <div role="alert" className="pop-in mx-auto max-w-sm rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-7 text-center">
              <Icon icon={IconRefresh} size={30} className="mx-auto text-cinnamon" />
              <p className="mt-2 font-display text-lg text-cocoa">the range didn&apos;t load</p>
              <p className="mt-1 text-sm text-ink-soft">a little hiccup on our end — give it another go.</p>
              <Button variant="secondary" size="lg" className="mt-4" onClick={load}>
                try again
              </Button>
            </div>
          ) : products ? (
            <FlowCatalogue products={products} showCategories />
          ) : (
            <TileSkeletonGrid count={8} label="loading the range" />
          )}
        </div>
      </main>
    </div>
  );
}
