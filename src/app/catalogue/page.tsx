'use client';

import { IconCards, IconShoppingBag, IconUsers, IconWand } from '@tabler/icons-react';
import Link from 'next/link';
import { useState } from 'react';
import { Chip } from '@/ui/primitives/Chip';
import { ProductCard } from '@/ui/components/ProductCard';
import type { ProductKey } from '@/ui/components/ProductArt';
import { BottomTabBar, type Tab } from '@/ui/components/BottomTabBar';

type CatalogueItem = {
  name: string;
  price: string;
  product: ProductKey;
  category: string;
  tint: string;
  featured?: boolean;
};

const PRODUCTS: CatalogueItem[] = [
  { name: 'card', price: '£4', product: 'card', category: 'cards & prints', tint: '#FDF0DC' },
  { name: 'framed print', price: '£22', product: 'framedPrint', category: 'cards & prints', tint: '#FBE4E1' },
  { name: 'mug', price: '£14', product: 'mug', category: 'home', tint: '#F6E2D6' },
  { name: 'kids tee', price: '£18', product: 'kidsTee', category: 'wear', tint: '#FBE4E1' },
  { name: 'cushion', price: '£28', product: 'cushion', category: 'home', tint: '#E2F0F4' },
  { name: 'blanket', price: '£45', product: 'blanket', category: 'home', tint: '#E8F0DF' },
  { name: 'storybook', price: '£24', product: 'storybook', category: 'books', tint: '#F6E2D6', featured: true },
  { name: 'jigsaw', price: '£20', product: 'jigsaw', category: 'gifts', tint: '#E2F0F4' },
];

const CATEGORIES = ['all', 'cards & prints', 'home', 'wear', 'books', 'gifts'];

const TABS: Tab[] = [
  { label: 'Range', href: '/catalogue', icon: IconCards },
  { label: 'Create', href: '/studio', icon: IconWand },
  { label: 'Family', href: '/home', icon: IconUsers },
  { label: 'Basket', href: '/checkout', icon: IconShoppingBag },
];

export default function CataloguePage() {
  const [category, setCategory] = useState('all');
  const shown = PRODUCTS.filter((p) => category === 'all' || p.category === category);

  return (
    <div className="flex min-h-dvh flex-col bg-oat pb-24 md:pb-0">
      <header className="flex items-center justify-between border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">
          snickerdoodle
        </Link>
        <span className="text-xs text-[#6F6358]">
          your artwork: <b className="font-semibold text-cocoa">Olivia&apos;s house</b>
        </span>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <h1 className="font-display text-2xl font-semibold md:text-3xl">
          Olivia&apos;s artwork, on <span className="text-cinnamon">40+ products</span>.
        </h1>
        <p className="mt-1 text-sm text-[#6F6358]">
          One drawing. A whole family range. Preview is on the house.
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
              tint={p.tint}
              featured={p.featured}
            />
          ))}
        </div>
      </main>

      <BottomTabBar tabs={TABS} active="Range" />
    </div>
  );
}
