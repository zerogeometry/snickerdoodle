'use client';

import { IconMinus, IconPlus, IconZoomScan } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';
import { MockupPreview } from './MockupPreview';
import { type ProductKey } from './ProductArt';
import { gbp, type Upload } from '@/lib/store';
import type { CatalogueProduct } from '@/server/catalogue';

const DEFAULT_TF = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

const SWATCH: Record<string, string> = {
  oak: '#C8A06A', black: '#2E2723', white: '#F7F2E8', sky: '#84BBD0', pink: '#E8A6B8',
  natural: '#E7D9BE', gold: '#D9B45B', blue: '#5B8AC0', 'caribbean blue': '#3FA9C9', 'cotton pink': '#E8A6B8',
};
const swatch = (name: string) => SWATCH[name] ?? '#E0C7A8';

function defaultVariant(p: CatalogueProduct) {
  return p.variants.find((v) => v.isDefault) ?? p.variants[0]!;
}

/**
 * One catalogue tile — the real photoreal preview (SVG fallback), a from-price, a
 * quick +/− stepper (showing the PRODUCT-LEVEL quantity across all its variants), and
 * a Customize button. Presentational: every action is a callback, so the same tile
 * serves the Most-Popular grid, the "your picks" row, and the Full Catalogue modal.
 */
export function ProductTile({
  p,
  qty,
  mockImg,
  upload,
  lazy = false,
  enableZoom = true,
  onAdd,
  onSub,
  onCustomize,
  onZoom,
}: {
  p: CatalogueProduct;
  qty: number;
  mockImg: string | null;
  upload: Upload;
  lazy?: boolean;
  enableZoom?: boolean;
  onAdd: () => void;
  onSub: () => void;
  onCustomize: () => void;
  onZoom?: () => void;
}) {
  const def = defaultVariant(p);
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#EADFC9] bg-[#FFFDF8] shadow-[0_2px_6px_rgba(46,39,35,.06)] @container">
      <div className="relative flex h-32 items-center justify-center bg-[#FBF5E9]">
        <MockupPreview
          productKey={p.key as ProductKey}
          assetId={upload?.assetId}
          variantId={def.id}
          transform={DEFAULT_TF}
          size="thumb"
          sourceObjectId={upload?.cutout?.sourceObjectId}
          image={mockImg}
          px={104}
          uid={p.key}
          lazy={lazy}
        />
        {enableZoom && onZoom ? (
          // Small badge, but the tap area is extended to ~44px via the ::before so it
          // meets the ≥44px touch-target rule without a big circle over the preview.
          <button
            type="button"
            onClick={onZoom}
            aria-label={`Enlarge ${p.label} preview`}
            className="absolute left-1.5 top-1.5 flex items-center justify-center rounded-full bg-white/85 p-1 text-[#7A6A58] shadow-sm before:absolute before:-inset-[11px] before:content-[''] hover:text-cinnamon"
          >
            <Icon icon={IconZoomScan} size={15} />
          </button>
        ) : null}
        {p.colours.length > 0 ? (
          <div role="img" aria-label={`available colours: ${p.colours.join(', ')}`} className="absolute right-1.5 top-1.5 flex flex-col gap-1">
            {p.colours.map((c) => (
              <span key={c} title={c} aria-hidden className="h-2.5 w-2.5 rounded-full border border-black/15 shadow-sm" style={{ backgroundColor: swatch(c) }} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 border-t border-[#EFE6D6] px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-1">
          <span className="min-w-0 truncate text-sm font-bold text-cocoa">{p.label}</span>
          <span className="shrink-0 whitespace-nowrap text-xs text-[#9C8E7E]">from {gbp(p.fromPence)}</span>
        </div>
        {/* Controls stack on a narrow tile (so each meets the 44px tap target without
            overflowing) and sit on one row once the TILE itself is wide enough. Uses a
            container query (not a viewport one) because tiles in the compact Start-Creating
            column stay narrow even on a wide screen. Falls back to stacked if unsupported. */}
        <div className="mt-auto flex flex-col gap-2 @[14rem]:flex-row @[14rem]:items-center @[14rem]:justify-between">
          <div className="flex items-center self-start rounded-full border border-[#E6D8BE] bg-white @[14rem]:self-auto">
            <button type="button" aria-label={`one fewer ${p.label}`} onClick={onSub} disabled={qty === 0} className="flex min-h-11 min-w-10 items-center justify-center text-[#7A6A58] disabled:opacity-30">
              <Icon icon={IconMinus} size={14} />
            </button>
            <span className="min-w-4 text-center text-xs font-bold text-cocoa">{qty}</span>
            <button type="button" aria-label={`add a ${p.label}`} onClick={onAdd} className="flex min-h-11 min-w-10 items-center justify-center text-cinnamon">
              <Icon icon={IconPlus} size={14} />
            </button>
          </div>
          <button type="button" onClick={onCustomize} className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-[#E6D8BE] bg-white px-3 text-[11px] font-bold text-cocoa hover:border-honey sm:w-auto">
            customize
          </button>
        </div>
      </div>
    </div>
  );
}

/** A responsive grid of {@link ProductTile}s. */
export function ProductGrid({
  products,
  qtyOf,
  mockImg,
  upload,
  lazy = false,
  enableZoom = true,
  gridClassName = 'grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 md:gap-4',
  onAdd,
  onSub,
  onCustomize,
  onZoom,
}: {
  products: CatalogueProduct[];
  qtyOf: (p: CatalogueProduct) => number;
  mockImg: string | null;
  upload: Upload;
  lazy?: boolean;
  enableZoom?: boolean;
  gridClassName?: string;
  onAdd: (p: CatalogueProduct) => void;
  onSub: (p: CatalogueProduct) => void;
  onCustomize: (p: CatalogueProduct) => void;
  onZoom?: (p: CatalogueProduct) => void;
}) {
  return (
    <div className={gridClassName}>
      {products.map((p) => (
        <ProductTile
          key={p.key}
          p={p}
          qty={qtyOf(p)}
          mockImg={mockImg}
          upload={upload}
          lazy={lazy}
          enableZoom={enableZoom}
          onAdd={() => onAdd(p)}
          onSub={() => onSub(p)}
          onCustomize={() => onCustomize(p)}
          onZoom={onZoom ? () => onZoom(p) : undefined}
        />
      ))}
    </div>
  );
}
