'use client';

import { IconSearch, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { ProductGrid } from './ProductGrid';
import { filterCatalogue, groupOf } from '@/lib/catalogue-view';
import { gbp, type Upload } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';

/**
 * The whole range, browsable in a pop-up: a sticky search bar + category filter over a
 * LAZY grid (tiles compose their photoreal preview only as you scroll to them, so opening
 * the full list doesn't fire dozens of renders). Add / customize work exactly as on the
 * front-of-shop; closing returns to Start Creating where everything added shows up top as
 * "your picks". Enlarge is intentionally off in here (no nested modals).
 */
export function FullCatalogueModal({
  open,
  onClose,
  products,
  qtyOf,
  upload,
  count,
  subtotal,
  onAdd,
  onSub,
  onCustomize,
  onZoom,
}: {
  open: boolean;
  onClose: () => void;
  products: CatalogueProduct[];
  qtyOf: (p: CatalogueProduct) => number;
  upload: Upload;
  count: number;
  subtotal: number;
  onAdd: (p: CatalogueProduct) => void;
  onSub: (p: CatalogueProduct) => void;
  onCustomize: (p: CatalogueProduct) => void;
  onZoom: (p: CatalogueProduct) => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');

  // Fresh search each time it opens.
  useEffect(() => {
    if (open) {
      setQ('');
      setCat('all');
    }
  }, [open]);

  const categories = useMemo(
    () => ['all', ...new Set(products.filter((p) => p.category !== 'ADDON').map((p) => groupOf(p.category)))],
    [products],
  );
  const shown = useMemo(
    () => filterCatalogue(products, q).filter((p) => cat === 'all' || groupOf(p.category) === cat),
    [products, q, cat],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="xl"
      fill
      title="The full catalogue"
      subtitle="every keepsake — search, add, or customize"
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-cocoa">
            {count > 0 ? `${count} item${count === 1 ? '' : 's'} in your basket · ${gbp(subtotal)}` : 'nothing added yet'}
          </span>
          <Button size="lg" onClick={onClose}>done browsing</Button>
        </div>
      }
    >
      {/* sticky search + category chips — bleed to the modal edges so content scrolls cleanly under */}
      <div className="sticky top-0 z-10 -mx-5 -mt-2 mb-1 border-b border-line bg-paper px-5 pb-2.5 pt-3">
        <div className="flex items-center gap-2 rounded-full border border-line bg-white px-3 py-2 focus-within:border-honey">
          <Icon icon={IconSearch} size={16} className="shrink-0 text-ink-faint" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="search the range — mug, cushion, blanket…"
            aria-label="Search the full catalogue"
            className="min-w-0 flex-1 bg-transparent text-sm text-cocoa outline-none placeholder:text-ink-faint"
          />
          {q ? (
            <button type="button" onClick={() => setQ('')} aria-label="Clear search" className="shrink-0 rounded-full p-0.5 text-ink-faint hover:text-cinnamon">
              <Icon icon={IconX} size={15} />
            </button>
          ) : null}
        </div>
        {categories.length > 2 ? (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-0.5">
            {categories.map((c) => (
              <Chip key={c} active={cat === c} onClick={() => setCat(c)}>{c}</Chip>
            ))}
          </div>
        ) : null}
      </div>

      {shown.length > 0 ? (
        <ProductGrid
          products={shown}
          qtyOf={qtyOf}
          upload={upload}
          lazy
          gridClassName="grid grid-cols-2 gap-3 pb-2 sm:grid-cols-3 md:grid-cols-4 md:gap-4"
          onAdd={onAdd}
          onSub={onSub}
          onCustomize={onCustomize}
          onZoom={onZoom}
        />
      ) : (
        <p className="py-12 text-center text-sm text-ink-soft">
          no keepsakes match “{q}”. <button type="button" onClick={() => { setQ(''); setCat('all'); }} className="font-bold text-cinnamon">clear search</button>
        </p>
      )}
    </Modal>
  );
}
