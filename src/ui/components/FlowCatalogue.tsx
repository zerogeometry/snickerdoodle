'use client';

import { IconChevronRight, IconGift, IconShirt, IconSparkles } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { WhoForModal } from '@/ui/modals/WhoForModal';
import { type ProductKey } from '@/ui/components/ProductArt';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { ProductGrid } from '@/ui/components/ProductGrid';
import { Basket } from '@/ui/components/Basket';
import { FullCatalogueModal } from '@/ui/components/FullCatalogueModal';
import { FamilySetModal } from '@/ui/components/FamilySetModal';
import { basketCount, basketSubtotal, gbp, toast, useBasket, useSelection, useUpload } from '@/lib/store';
import { FAMILY_SET_PRODUCT_KEYS } from '@/pricing';
import { startGuestUpload } from '@/app/actions/guestUpload';
import { defaultTransformFor, groupOf, lineIdForSku, productQtyInBasket, resolveDisplayVariant, splitCatalogue } from '@/lib/catalogue-view';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';

function variantSub(v: CatalogueVariant): string | undefined {
  const bits = [v.attributes.size, v.attributes.colour, v.attributes.orientation === 'landscape' ? 'landscape' : null].filter(Boolean);
  return bits.length ? bits.join(' · ') : undefined;
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`mb-1 font-display text-lg text-cocoa ${className}`}>{children}</h2>;
}

/**
 * The shared "your art on a range" grid. Two layouts:
 *  - `sections` (Start Creating front-of-shop): a curated **Most Popular** grid with a
 *    **Full Catalogue** button top-right that opens the searchable full range in a modal;
 *    anything the shopper adds from there that isn't already popular is pinned above as
 *    **your picks** on return.
 *  - `flat` (the standalone /catalogue page): the whole range in one grid with category
 *    chips.
 * Tiles are lazy (compose only when scrolled into view), and the upload is ingested in
 * the background so previews are ready as the shopper browses. The footer tallies a
 * running total + Create Another / Share / Checkout.
 */
export function FlowCatalogue({
  products,
  mode = 'flat',
  showCategories = false,
  compact = false,
  scrollable = false,
  className,
}: {
  products: CatalogueProduct[];
  mode?: 'sections' | 'flat';
  showCategories?: boolean; // flat mode only
  compact?: boolean; // denser grid for the narrower Start-Creating column
  scrollable?: boolean; // scroll the range inside a fixed-height container
  className?: string;
}) {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const setAssetId = useUpload((s) => s.setAssetId);
  const items = useBasket((s) => s.items);
  const add = useBasket((s) => s.add);
  const setQty = useBasket((s) => s.setQty);

  const [category, setCategory] = useState('all');
  const [zoom, setZoom] = useState<CatalogueProduct | null>(null);
  const [whoMode, setWhoMode] = useState<'checkout' | 'share' | null>(null);
  const [fullOpen, setFullOpen] = useState(false);
  const [familyOpen, setFamilyOpen] = useState(false);
  // A single in-flight ingest, shared across clicks — so a slow first ingest can't
  // deadlock the catalogue (the previous global "busy" flag froze every button).
  const ingestRef = useRef<Promise<string | null> | null>(null);

  const subtotal = basketSubtotal(items);
  const count = basketCount(items);

  // Ingest the upload server-side once, so add-to-basket + render have a real asset.
  // Concurrent callers share the SAME in-flight ingest (no double-upload, no freeze).
  const ensureAsset = useCallback(async (): Promise<string | null> => {
    if (upload?.assetId) return upload.assetId;
    if (!upload) return null;
    if (ingestRef.current) return ingestRef.current; // an ingest is already running — reuse it
    const run = (async (): Promise<string | null> => {
      try {
        const blob = await fetch(upload.dataUrl).then((r) => r.blob());
        const fd = new FormData();
        fd.append('image', blob, upload.name || 'drawing.png');
        fd.append('termsAccepted', 'true');
        const res = await startGuestUpload(fd);
        if (res.ok && res.assetId) {
          setAssetId(res.assetId);
          return res.assetId;
        }
        toast(res.blocked ? 'we couldn’t use that image — try another' : 'hmm, that didn’t work — try again');
        return null;
      } catch {
        // e.g. a too-large upload or a network blip — surface it, never throw silently
        toast('that didn’t upload — try again, or a smaller image');
        return null;
      }
    })();
    ingestRef.current = run;
    try {
      return await run;
    } finally {
      ingestRef.current = null;
    }
  }, [upload, setAssetId]);

  const guardUpload = (): boolean => {
    if (!upload) {
      toast('upload a drawing first');
      router.push('/start-creating');
      return false;
    }
    return true;
  };

  // Warm path: the moment a drawing is present, ingest it in the BACKGROUND so tiles can
  // upgrade from the stylised SVG to the real in-VPC photoreal mockup as they scroll into
  // view — the shopper never waits. Idempotent, and shares the single in-flight ingest.
  useEffect(() => {
    if (upload && !upload.assetId) void ensureAsset();
  }, [upload, ensureAsset]);

  const qtyOf = useCallback((p: CatalogueProduct) => productQtyInBasket(items, p), [items]);

  const quickAdd = async (p: CatalogueProduct, delta: number) => {
    // Add EXACTLY what the tile shows (the shared resolver): an explicit selection, else the
    // aspect-oriented variant, else the default — never a landscape tile that adds a portrait SKU.
    const def = resolveDisplayVariant(p, { aspect: upload?.aspect, selection: useSelection.getState().selections[p.key] });
    const defId = lineIdForSku(def.sku);
    // Decrement is purely local — always allowed (never gated by an in-flight ingest).
    // Take one off the DEFAULT quick-add line first; otherwise the most-recently-added
    // line of this product (so the tile's product-level count steps down by one, and a
    // carefully-customized line is only removed once it actually hits zero).
    if (delta < 0) {
      const current = useBasket.getState().items;
      const ids = new Set(p.variants.map((v) => lineIdForSku(v.sku)));
      const target = current.find((i) => i.id === defId) ?? [...current].reverse().find((i) => ids.has(i.id));
      if (target) setQty(target.id, target.qty - 1);
      return;
    }
    if (!guardUpload()) return;
    if (!upload?.assetId && !ingestRef.current) toast('adding to your basket…'); // first add ingests — show it's working
    const assetId = await ensureAsset();
    if (!assetId) return;
    // Re-read from the store — a concurrent add may have created the line meanwhile.
    const current = useBasket.getState().items.find((i) => i.id === defId);
    if (current) setQty(defId, current.qty + 1);
    else
      add({
        id: defId,
        name: p.label,
        product: p.key as ProductKey,
        sku: def.sku,
        variantId: def.id,
        pricePence: def.pricePence,
        sub: variantSub(def),
        artwork: { assetId, transform: defaultTransformFor(p.key), sourceObjectId: upload?.cutout?.sourceObjectId },
      });
  };

  const customize = async (p: CatalogueProduct) => {
    if (!guardUpload()) return;
    if (!upload?.assetId && !ingestRef.current) toast('getting it ready…');
    const assetId = await ensureAsset();
    if (assetId) router.push(`/customize/${p.key}`);
  };

  const { picks, popular } = useMemo(() => splitCatalogue(products, items), [products, items]);

  // The banner promises "matching organic tees + a bodysuit" — only show it when all
  // three garments are actually purchasable (an unseeded/partial catalogue would
  // otherwise open a dead-end set builder). With the curated storefront this also
  // parks the whole family-set flow until the garments graduate back on show.
  const familySetAvailable = FAMILY_SET_PRODUCT_KEYS.every((k) => products.some((p) => p.key === k));

  // "Full catalogue" earns its place only when it holds something beyond the sections
  // already on screen — a one-product storefront must not open a modal of the same tile.
  const hasMoreThanShown = useMemo(
    () => products.some((p) => p.category !== 'ADDON' && p.popularRank == null && !picks.some((x) => x.key === p.key)),
    [products, picks],
  );

  // flat mode (the standalone /catalogue page): category chips over one grid
  const flatCategories = useMemo(
    () => ['all', ...new Set(products.filter((p) => p.category !== 'ADDON').map((p) => groupOf(p.category)))],
    [products],
  );
  const flatShown = products.filter((p) => p.category !== 'ADDON' && (category === 'all' || groupOf(p.category) === category));

  const gridClassName = compact
    ? 'grid grid-cols-2 gap-x-4 gap-y-7 pt-3' // 2-up so tiles are wide enough to keep −/+/customize on ONE row
    : 'grid grid-cols-2 gap-x-4 gap-y-7 pt-3 sm:grid-cols-3 md:grid-cols-4 md:gap-x-5';
  const scrollClasses = scrollable ? 'brand-scroll overflow-y-auto px-1.5 pb-3 h-[55vh] md:h-[calc(100dvh-23rem)] md:max-h-[34rem]' : undefined;
  // Sections (Start-Creating) uses the basket-sidebar model: the catalogue tiles just
  // "+ customize", and quantity lives in the basket — so no per-tile stepper.
  const gridProps = {
    qtyOf,
    upload,
    lazy: true,
    showStepper: mode !== 'sections',
    customizeLabel: mode === 'sections' ? '+ customize' : 'customize',
    onAdd: (p: CatalogueProduct) => quickAdd(p, 1),
    onSub: (p: CatalogueProduct) => quickAdd(p, -1),
    onCustomize: customize,
  };

  return (
    <div className={className}>
      {mode === 'sections' ? (
        // Catalogue on the left, a slim vertical basket down the right (founder layout).
        // Both columns are a FIXED height and scroll internally, so the panel doesn't grow
        // or jump as creations are added — only the content inside each scrolls.
        <div className="grid gap-4 md:h-[calc(100dvh-23rem)] md:max-h-[34rem] md:grid-cols-[1fr_8rem] md:items-stretch">
          <div className="flex min-h-0 min-w-0 flex-col">
          {/* Header — the section title and the Full Catalogue button on one aligned row.
              When the shopper has picks from the full catalogue the title steps aside to
              "your range" and the two sections are labelled inside the scroll instead. */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="font-display text-xl text-cocoa">{picks.length > 0 ? 'your range' : popular.length === 1 && picks.length === 0 ? 'your keepsake' : 'most popular'}</h2>
            {hasMoreThanShown ? (
              <Button variant="secondary" onClick={() => setFullOpen(true)} className="shrink-0">
                full catalogue <Icon icon={IconChevronRight} size={15} />
              </Button>
            ) : null}
          </div>
          {/* The hero set: one drawing, the whole family matching. Opens the set builder. */}
          {familySetAvailable ? (
            <button
              type="button"
              onClick={() => { if (guardUpload()) setFamilyOpen(true); }}
              className="press mb-3 flex w-full items-center gap-3 rounded-[18px] border-2 border-cocoa bg-honey-band p-3.5 text-left shadow-[0_3px_0_var(--color-cocoa)] active:shadow-none"
            >
              <span className="wiggle flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-cocoa bg-honey">
                <Icon icon={IconShirt} size={20} className="text-cocoa" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-base text-cocoa">dress the whole family</span>
                <span className="block text-[12px] text-ink-soft">matching organic tees + a bodysuit for the littlest — 3+ pieces saves 5%</span>
              </span>
              <Icon icon={IconChevronRight} size={18} className="shrink-0 text-cocoa" />
            </button>
          ) : null}
          {/* Fills the remaining column height and scrolls; fixed height on mobile too. */}
          <div className="brand-scroll h-[52vh] min-h-0 flex-1 overflow-y-auto px-1.5 pb-3 md:h-auto">
            {picks.length > 0 ? (
              <>
                <SectionLabel>your picks</SectionLabel>
                <ProductGrid products={picks} gridClassName={gridClassName} onZoom={setZoom} {...gridProps} />
              </>
            ) : null}
            {popular.length > 0 ? (
              <>
                {picks.length > 0 ? <SectionLabel className="mt-5">most popular</SectionLabel> : null}
                <ProductGrid products={popular} gridClassName={gridClassName} onZoom={setZoom} {...gridProps} />
              </>
            ) : picks.length === 0 ? (
              // success-but-empty: never a bare heading over a void
              <div className="mt-3 rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-6 text-center text-sm text-ink-soft">
                {hasMoreThanShown ? (
                  <>tap <b className="text-cinnamon">full catalogue</b> to browse the whole range.</>
                ) : (
                  <>the range is being lovingly prepared — back very soon.</>
                )}
              </div>
            ) : null}
          </div>
          </div>
          <Basket className="h-[52vh] md:h-full" />
        </div>
      ) : (
        <>
          {showCategories ? (
            <div className="-mx-1 mb-1 flex gap-2 overflow-x-auto px-1 pb-2 pt-1" role="group" aria-label="filter the range">
              {flatCategories.map((c) => (
                <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
                  {c}
                </Chip>
              ))}
            </div>
          ) : null}
          <div className={scrollClasses}>
            <ProductGrid products={flatShown} gridClassName={gridClassName} onZoom={setZoom} {...gridProps} />
          </div>
        </>
      )}

      {/* Footer: basket count (so "Create another" clearly keeps the basket) + total + actions */}
      <div className="mt-4 rounded-[18px] border-2 border-cocoa bg-paper p-4 shadow-[0_3px_0_var(--color-cocoa)]">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-cocoa">
            {count > 0 ? `${count} item${count === 1 ? '' : 's'} added to your basket` : 'nothing added yet'}
          </span>
          <div className="text-right">
            <div className="font-display text-xl text-cocoa">{gbp(subtotal)}</div>
            <div className="text-[11px] font-semibold text-green-save">free tracked delivery</div>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5 sm:flex-row">
          <Button variant="secondary" size="lg" className="sm:flex-1" onClick={() => { useUpload.getState().resetUpload(); router.push('/start-creating'); }}>
            create another
          </Button>
          <Button variant="secondary" size="lg" className="sm:flex-1" onClick={() => setWhoMode('share')} disabled={items.length === 0}>
            <Icon icon={IconGift} size={15} /> share a wish
          </Button>
          <Button size="lg" className="sm:flex-1" onClick={() => setWhoMode('checkout')} disabled={items.length === 0}>
            checkout now <Icon icon={IconSparkles} size={15} />
          </Button>
        </div>
      </div>

      <WhoForModal open={!!whoMode} mode={whoMode ?? 'checkout'} onClose={() => setWhoMode(null)} />

      {mode === 'sections' && familySetAvailable ? (
        <FamilySetModal
          open={familyOpen}
          onClose={() => setFamilyOpen(false)}
          products={products}
          upload={upload}
          ensureAsset={ensureAsset}
        />
      ) : null}

      {mode === 'sections' && hasMoreThanShown ? (
        <FullCatalogueModal
          open={fullOpen}
          onClose={() => setFullOpen(false)}
          products={products}
          qtyOf={qtyOf}
          upload={upload}
          count={count}
          subtotal={subtotal}
          onAdd={(p) => quickAdd(p, 1)}
          onSub={(p) => quickAdd(p, -1)}
          onCustomize={customize}
          onZoom={setZoom}
        />
      ) : null}

      {/* Big close-up: near-fullscreen on mobile, large on desktop. */}
      <Modal open={!!zoom} onClose={() => setZoom(null)} size="xl" fill title={zoom?.label ?? ''} subtitle={zoom ? `from ${gbp(zoom.fromPence)}` : undefined}>
        {zoom ? (
          <div className="flex h-full flex-col items-center gap-3 py-2">
            <div className="flex w-full flex-1 items-center justify-center overflow-hidden rounded-2xl bg-paper-2 p-3">
              <MockupPreview
                productKey={zoom.key as ProductKey}
                assetId={upload?.assetId}
                // Match the tile: the enlargement shows the same auto-oriented variant, not the
                // fixed default (so a landscape tile doesn't open a portrait close-up).
                variantId={resolveDisplayVariant(zoom, { aspect: upload?.aspect, selection: useSelection.getState().selections[zoom.key] }).id}
                transform={defaultTransformFor(zoom.key)}
                size="zoom"
                sourceObjectId={upload?.cutout?.sourceObjectId}
                px={720}
              />
            </div>
            <Button size="lg" className="w-full" onClick={() => { const p = zoom; setZoom(null); if (p) void customize(p); }}>
              customize this
            </Button>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
