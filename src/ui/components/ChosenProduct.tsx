'use client';

import { IconArrowRight } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import type { CatalogueProduct } from '@/server/catalogue';
import { Button } from '../primitives/Button';
import { Icon } from '../primitives/Icon';
import { ChristmasPromise } from './ChristmasPromise';

/**
 * The `?for=<productKey>` shortcut (D24): a parent who came from /christmas (or any page) for ONE
 * thing — "this year's bauble" — uploads their drawing as usual, and this sticker sits on top of
 * the range with a straight path to customising that product. The whole range stays right below:
 * Christmas works WITH the regular catalogue, never a separate shop. Only shown products count.
 */
export function ChosenProduct({ products }: { products: CatalogueProduct[] }) {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => setKey(new URLSearchParams(window.location.search).get('for')), []);
  const product = key ? products.find((p) => p.key === key) : undefined;
  if (!product) return null;
  return (
    <div className="tape mb-5 flex flex-col gap-3 rounded-[18px] border-2 border-cocoa bg-honey-band p-4 shadow-[0_3px_0_var(--color-cocoa)] sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg text-cocoa">your {product.label} is ready to make</p>
        <div className="mt-1">
          <ChristmasPromise productKey={product.key} />
        </div>
      </div>
      <Button href={`/customize/${product.key}`} size="lg" className="sm:w-auto">
        make the {product.label} <Icon icon={IconArrowRight} size={18} />
      </Button>
    </div>
  );
}
