'use client';

import { IconArrowLeft, IconShoppingBag } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { ProductCard } from '@/ui/components/ProductCard';
import type { ProductKey } from '@/ui/components/ProductArt';
import { BottomTabBar } from '@/ui/components/BottomTabBar';
import { APP_TABS } from '@/ui/components/appTabs';
import { basketCount, toast, useBasket, useUpload } from '@/lib/store';

type CatalogueItem = {
  name: string;
  price: string;
  pricePence: number;
  product: ProductKey;
  category: string;
  tint: string;
  featured?: boolean;
};

const PRODUCTS: CatalogueItem[] = [
  { name: 'card', price: '£4', pricePence: 400, product: 'card', category: 'cards & prints', tint: '#FDF0DC' },
  { name: 'framed print', price: '£22', pricePence: 2200, product: 'framedPrint', category: 'cards & prints', tint: '#FBE4E1' },
  { name: 'mug', price: '£14', pricePence: 1400, product: 'mug', category: 'home', tint: '#F6E2D6' },
  { name: 'kids tee', price: '£18', pricePence: 1800, product: 'kidsTee', category: 'wear', tint: '#FBE4E1' },
  { name: 'cushion', price: '£28', pricePence: 2800, product: 'cushion', category: 'home', tint: '#E2F0F4' },
  { name: 'blanket', price: '£45', pricePence: 4500, product: 'blanket', category: 'home', tint: '#E8F0DF' },
  { name: 'storybook', price: '£24', pricePence: 2400, product: 'storybook', category: 'books', tint: '#F6E2D6', featured: true },
  { name: 'jigsaw', price: '£20', pricePence: 2000, product: 'jigsaw', category: 'gifts', tint: '#E2F0F4' },
];

const CATEGORIES = ['all', 'cards & prints', 'home', 'wear', 'books', 'gifts'];

export default function CataloguePage() {
  const [category, setCategory] = useState('all');
  const items = useBasket((s) => s.items);
  const add = useBasket((s) => s.add);
  const upload = useUpload((s) => s.upload);
  const count = basketCount(items);
  const shown = PRODUCTS.filter((p) => category === 'all' || p.category === category);

  const addToBasket = (p: CatalogueItem) => {
    add({ id: p.product, name: p.name, product: p.product, pricePence: p.pricePence });
    toast(`${p.name} added to basket`);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <div className="flex items-center gap-2.5">
          <Link href="/start-creating" aria-label="Back to your drawing">
            <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
          </Link>
          <Link href="/" className="font-display text-xl font-semibold text-cocoa">
            snickerdoodle
          </Link>
        </div>
        <div className="flex items-center gap-4">
          {upload ? (
            <span className="hidden text-xs text-[#6F6358] sm:inline">
              your artwork: <b className="font-semibold text-cocoa">your drawing</b>
            </span>
          ) : null}
          <Link href="/checkout" aria-label={`Basket, ${count} items`} className="relative text-[#7A6A58] hover:text-cinnamon">
            <Icon icon={IconShoppingBag} size={22} />
            {count > 0 ? (
              <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-cinnamon px-1 text-[10px] font-bold text-cta-text">
                {count}
              </span>
            ) : null}
          </Link>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <h1 className="font-display text-2xl font-semibold md:text-3xl">
          {upload ? 'Your artwork' : 'Any drawing'}, on a <span className="text-cinnamon">whole family range</span>.
        </h1>
        <p className="mt-1 text-sm text-[#6F6358]">
          {upload
            ? 'One drawing. A whole family range — tap a product to add it to your basket.'
            : 'Upload a drawing and watch it land on everything. Tap a product to start.'}
        </p>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4">
          {shown.map((p) => (
            <ProductCard
              key={p.name}
              name={p.name}
              price={p.price}
              product={p.product}
              image={upload?.dataUrl}
              tint={p.tint}
              featured={p.featured}
              onClick={() => addToBasket(p)}
            />
          ))}
        </div>
      </main>

      <BottomTabBar tabs={APP_TABS} active="Create" />
    </div>
  );
}
