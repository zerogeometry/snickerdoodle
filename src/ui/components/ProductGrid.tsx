'use client';

import { IconMinus, IconPlus, IconZoomScan } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';
import { MockupPreview } from './MockupPreview';
import { type ProductKey } from './ProductArt';
import { gbp, usePlacements, useSelection, type Upload } from '@/lib/store';
import { MUG_SWATCH, defaultPlacementFor, resolveDisplayVariant } from '@/lib/catalogue-view';
import { garmentHex, isGarmentKey } from '@/lib/garments';
import type { CatalogueProduct } from '@/server/catalogue';
import type { MockupRequest } from '@/lib/mockupPrefetch';
import { useLocalPreview } from '@/lib/localPreview';

/**
 * What a range TILE shows for a product — the variant, placement and view its preview composes
 * with. ONE resolver for the tile and the range prefetch (FlowCatalogue), so a prefetched picture
 * is always exactly the one the tile asks for.
 */
export function tileMockupInputs(
  p: CatalogueProduct,
  upload: Upload,
  selection: { size?: string; colour?: string; orientation?: string } | undefined,
  savedTf: MockupRequest['transform'] | undefined,
): { variantId: string; transform: MockupRequest['transform']; view: string | undefined; sourceObjectId: string | undefined } {
  const shownVariant = resolveDisplayVariant(p, { aspect: upload?.aspect, selection });
  return {
    variantId: shownVariant.id,
    transform: savedTf ?? defaultPlacementFor(p.key, shownVariant.attributes, upload?.aspect),
    // The mug's hero is its centred wrap (design middle, handle hidden), not the handle-right front.
    view: p.key === 'mug' ? 'centre' : undefined,
    sourceObjectId: upload?.cutout?.sourceObjectId,
  };
}

const SWATCH: Record<string, string> = {
  oak: '#C8A06A', black: '#2E2723', white: '#F7F2E8', sky: '#84BBD0', pink: '#E8A6B8',
  natural: '#E7D9BE', gold: '#D9B45B', blue: '#5B8AC0', 'caribbean blue': '#3FA9C9', 'cotton pink': '#E8A6B8',
  brown: '#6B4A32', 'dark grey': '#4D4C4A', 'light grey': '#CFCDC8', silver: '#B9B6AE',
};
// SWATCH above holds the REAL product material colours (a black frame, an oak frame…) — product
// data, not brand styling, so they stay literal. Unknown colours fall back to a token.
const swatch = (name: string, productKey?: string) => (productKey === 'mug' && MUG_SWATCH[name]) || (isGarmentKey(productKey) && garmentHex(name)) || SWATCH[name] || 'var(--color-line)';

// Washi-tape colours, cycled by index so a grid looks hand-stuck but never random (no layout shift).
const TAPES = ['honey', 'sky', 'berry', 'leaf'].map((t) => `color-mix(in srgb, var(--color-${t}) 80%, transparent)`);

/**
 * One catalogue tile — the real photoreal preview, a from-price, a quick +/− stepper
 * (showing the PRODUCT-LEVEL quantity across all its variants), and a Customize
 * button. Presentational: every action is a callback, so the same tile serves the
 * Most-Popular grid, the "your picks" row, and the Full Catalogue modal.
 */
export function ProductTile({
  p,
  qty,
  upload,
  lazy = false,
  enableZoom = true,
  showStepper = true,
  customizeLabel = 'customize',
  onAdd,
  onSub,
  onCustomize,
  onZoom,
  index = 0,
}: {
  p: CatalogueProduct;
  qty: number;
  /** Position in the grid — varies the resting tilt + tape colour, deterministically. */
  index?: number;
  upload: Upload;
  lazy?: boolean;
  enableZoom?: boolean;
  /** When false, the per-tile qty stepper is hidden — adding + adjusting quantity lives in
   * the basket instead (the Start-Creating sidebar model). */
  showStepper?: boolean;
  customizeLabel?: string;
  onAdd: () => void;
  onSub: () => void;
  onCustomize: () => void;
  onZoom?: () => void;
}) {
  // Reflect the shopper's OWN choices so the tile shows what they set — not the defaults.
  // Placement (zoom/position) is carried in usePlacements, keyed by (asset, product) to
  // match what add-to-basket stores; the chosen size/colour/orientation in useSelection.
  const savedTf = usePlacements((s) => (upload?.assetId ? s.placements[`${upload.assetId}-${p.key}`] : undefined));
  const sel = useSelection((s) => s.selections[p.key]);
  // The ONE resolver the tile, the quick-add "+", and the enlarge modal all share (catalogue-view),
  // so the tile can never show a landscape frame while "+" quietly adds the portrait default:
  // explicit selection wins; else auto-orient to the drawing's aspect; else the plain default.
  const shown = tileMockupInputs(p, upload, sel, savedTf);
  // the instant preview: the drawing as this browser already holds it (the cutout once made)
  const localSrc = useLocalPreview(upload?.cutout ? null : upload?.dataUrl);
  const instantSrc = (upload?.cutout && !upload.cutout.trim ? upload.cutout.url : null) ?? localSrc;
  return (
    // A taped polaroid (Scrapbook D12): white border, washi tape, a small resting tilt that
    // straightens + rises on hover/focus (.lift). No overflow clip on the card itself so the tape
    // can sit proud of the top edge; the preview area clips its own contents.
    <div
      className="polaroid tape lift group relative flex h-full flex-col @container"
      style={{
        ['--tilt' as string]: index % 3 === 0 ? '-1.4deg' : index % 3 === 1 ? '1.1deg' : '-0.5deg',
        ['--tape' as string]: TAPES[index % TAPES.length],
        ['--tape-rot' as string]: index % 2 ? '4deg' : '-3deg',
      }}
    >
      {/* SQUARE image area (the product photos are square-ish): the preview is contained
          inside it, so the name/price row + controls below are never covered. */}
      <div className="relative aspect-square w-full overflow-hidden bg-paper-2 p-2">
        <MockupPreview
          productKey={p.key as ProductKey}
          assetId={upload?.assetId}
          variantId={shown.variantId}
          transform={shown.transform as Parameters<typeof MockupPreview>[0]['transform']}
          size="thumb"
          sourceObjectId={shown.sourceObjectId}
          view={shown.view}
          px={128}
          lazy={lazy}
          instant={instantSrc && upload?.aspect ? { src: instantSrc, aspect: upload.aspect } : null}
        />
        {/* Tapping the preview opens the product — the SAME action as the customize button
            below. A mouse/touch convenience only (tabIndex -1): keyboard + screen-reader users
            use the labelled customize button, so this isn't a second tab stop. Sits under the
            zoom badge (z-20) so zoom still wins where they overlap. */}
        <button
          type="button"
          tabIndex={-1}
          onClick={onCustomize}
          aria-label={`customize ${p.label}`}
          className="absolute inset-0 z-10 cursor-pointer"
        />
        {enableZoom && onZoom ? (
          // Small badge, but the tap area is extended to ~44px via the ::before so it
          // meets the ≥44px touch-target rule without a big circle over the preview.
          <button
            type="button"
            onClick={onZoom}
            aria-label={`Enlarge ${p.label} preview`}
            className="absolute left-1.5 top-1.5 z-20 flex items-center justify-center rounded-full border-2 border-cocoa bg-paper p-0.5 text-cocoa before:absolute before:-inset-[11px] before:content-[''] hover:text-cinnamon"
          >
            <Icon icon={IconZoomScan} size={15} />
          </button>
        ) : null}
        {p.colours.length > 0 ? (
          // Decorative — click-through (pointer-events-none) so tapping here still opens the product.
          <div role="img" aria-label={`available colours: ${p.colours.join(', ')}`} className="pointer-events-none absolute right-1.5 top-1.5 z-20 flex flex-col gap-1">
            {p.colours.map((c) => (
              <span key={c} title={c} aria-hidden className="h-2.5 w-2.5 rounded-full border border-cocoa/30" style={{ backgroundColor: swatch(c, p.key) }} />
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 px-1 pb-0.5 pt-2.5">
        {/* phones: the name and the price each get their own line; from sm, one row */}
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-1">
          <span className="min-w-0 truncate text-base font-extrabold text-cocoa sm:text-sm">{p.label}</span>
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-ink-soft sm:text-xs">from {gbp(p.fromPence)}</span>
        </div>
        {/* Controls stack on a narrow tile (so each meets the 44px tap target without
            overflowing) and sit on one row once the TILE itself is wide enough. Uses a
            container query (not a viewport one) because tiles in the compact Start-Creating
            column stay narrow even on a wide screen. Falls back to stacked if unsupported. */}
        <div className="mt-auto flex flex-col gap-2 @[14rem]:flex-row @[14rem]:items-center @[14rem]:justify-between">
          {showStepper ? (
            <div className="flex items-center self-start rounded-full border-2 border-cocoa/25 bg-paper @[14rem]:self-auto">
              <button type="button" aria-label={`one fewer ${p.label}`} onClick={onSub} disabled={qty === 0} className="press flex min-h-11 min-w-11 items-center justify-center text-cocoa disabled:opacity-30">
                <Icon icon={IconMinus} size={14} />
              </button>
              <span className="min-w-4 text-center text-xs font-bold text-cocoa">{qty}</span>
              <button type="button" aria-label={`add a ${p.label}`} onClick={onAdd} className="press flex min-h-11 min-w-11 items-center justify-center text-cinnamon">
                <Icon icon={IconPlus} size={14} />
              </button>
            </div>
          ) : null}
          <button type="button" onClick={onCustomize} className={`press inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-pill border-2 border-cocoa bg-paper px-3 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)] hover:bg-honey-band active:shadow-none ${showStepper ? 'w-full sm:w-auto' : 'w-full'}`}>
            {customizeLabel}
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
  upload,
  lazy = false,
  enableZoom = true,
  showStepper = true,
  customizeLabel = 'customize',
  gridClassName = 'grid grid-cols-1 gap-y-7 pt-3 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4',
  onAdd,
  onSub,
  onCustomize,
  onZoom,
  insert,
}: {
  /** An extra tile slotted in after a product (e.g. the family set after the tees); appended
   * at the end when that product isn't in this grid. Gets its grid index for tilt/tape. */
  insert?: { afterKey: string; render: (index: number) => React.ReactNode };
  products: CatalogueProduct[];
  qtyOf: (p: CatalogueProduct) => number;
  upload: Upload;
  lazy?: boolean;
  enableZoom?: boolean;
  showStepper?: boolean;
  customizeLabel?: string;
  gridClassName?: string;
  onAdd: (p: CatalogueProduct) => void;
  onSub: (p: CatalogueProduct) => void;
  onCustomize: (p: CatalogueProduct) => void;
  onZoom?: (p: CatalogueProduct) => void;
}) {
  return (
    <div className={gridClassName}>
      {(() => {
        const at = insert ? products.findIndex((p) => p.key === insert.afterKey) : -1;
        const slot = insert ? (at >= 0 ? at + 1 : products.length) : -1;
        const tiles = products.map((p, i) => {
          const gi = slot >= 0 && i >= slot ? i + 1 : i; // grid position, counting the inserted tile
          return (
            // Staggered sticker-slap entrance on a WRAPPER — .pop-in's fill would otherwise pin the
            // tile's transform and cancel its .lift hover.
            <div key={p.key} className="pop-in" style={{ ['--i' as string]: Math.min(gi, 12) }}>
              <ProductTile
                p={p}
                index={gi}
                qty={qtyOf(p)}
                upload={upload}
                lazy={lazy}
                enableZoom={enableZoom}
                showStepper={showStepper}
                customizeLabel={customizeLabel}
                onAdd={() => onAdd(p)}
                onSub={() => onSub(p)}
                onCustomize={() => onCustomize(p)}
                onZoom={onZoom ? () => onZoom(p) : undefined}
              />
            </div>
          );
        });
        if (insert && slot >= 0) {
          tiles.splice(
            slot,
            0,
            <div key="__insert" className="pop-in" style={{ ['--i' as string]: Math.min(slot, 12) }}>
              {insert.render(slot)}
            </div>,
          );
        }
        return tiles;
      })()}
    </div>
  );
}
