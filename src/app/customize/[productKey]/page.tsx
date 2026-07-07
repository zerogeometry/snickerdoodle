'use client';

import { IconArrowLeft, IconChevronDown, IconChevronLeft, IconChevronRight, IconCircleCheck, IconPencil, IconShoppingBag, IconZoomScan } from '@tabler/icons-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Modal } from '@/ui/primitives/Modal';
import { Icon } from '@/ui/primitives/Icon';
import { type ProductKey } from '@/ui/components/ProductArt';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { gbp, toast, useBasket, usePlacements, useSelection, useUpload } from '@/lib/store';
import { defaultTransformFor, lineIdForSku } from '@/lib/catalogue-view';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { has3D } from '@/ui/three/spinnable';
import type { CatalogueProduct } from '@/server/catalogue';

// Tier-C 3D spin view — lazy, so three.js never loads unless someone opens it.
// (The framed print deliberately has NO 3D/wall views — founder call 2026-07-07:
// one perfect photo view; the spin stays for other products' curation.)
const Product3D = dynamic(() => import('@/ui/three/Product3D'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center text-xs text-[#9C8E7E]">warming up the spin view…</div>,
});

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Customize a product: size + colour + placement only. Image-level edits (remove
 * background, the studio) live on the catalogue page and apply to every product —
 * here we just place the (already-edited) image on this product.
 */
export default function CustomizePage() {
  const router = useRouter();
  const params = useParams<{ productKey: string }>();
  const productKey = params.productKey;

  const upload = useUpload((s) => s.upload);
  const add = useBasket((s) => s.add);
  const update = useBasket((s) => s.update);
  const placements = usePlacements((s) => s.placements);

  // Edit mode: arrived from a basket line (?edit=<lineId>) to change that exact creation.
  // We carry the line's OWN asset so editing a line placed under a previous drawing
  // ("create another") edits the right image, not whatever's currently uploaded.
  const [edit, setEdit] = useState<{ id: string; assetId?: string; sourceObjectId?: string } | null>(null);
  const editSeededRef = useRef(false);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<string>('portrait');
  const [orientationTouched, setOrientationTouched] = useState(false);
  // Ref (updates synchronously, unlike the state above) so the image-aspect auto-default
  // effect — which runs in the SAME flush as the restore effect — sees an explicit choice
  // immediately and doesn't clobber a restored/editor-chosen orientation with a guess.
  const orientationLockedRef = useRef(false);
  const [descOpen, setDescOpen] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [view, setView] = useState<'photo' | 'spin'>('photo'); // preview mode
  const [canSpin, setCanSpin] = useState(false);
  // Colour thumbnail strip paging (3 visible at a time).
  const [thumbIdx, setThumbIdx] = useState(0);
  useEffect(() => {
    setCanSpin(has3D(productKey) && webglOk());
    setView('photo'); // reset when the product changes
    setThumbIdx(0);
  }, [productKey]);

  useEffect(() => {
    // ?all=1 = the DEV curation view (customize a hidden product before it graduates);
    // the server action refuses includeHidden in production.
    const includeHidden = new URLSearchParams(window.location.search).get('all') === '1';
    void loadCatalogueAction(includeHidden ? { includeHidden } : undefined).then(setProducts);
  }, []);

  const product = products?.find((p) => p.key === productKey) ?? null;

  // Edit seed (runs once, before the hydration effect below so it reads these values):
  // pull the basket line's variant → selection and its saved placement, so Customize
  // opens showing that exact creation. A stale/removed line falls through as a fresh customize.
  useEffect(() => {
    if (!product || editSeededRef.current) return;
    const editParam = new URLSearchParams(window.location.search).get('edit');
    editSeededRef.current = true;
    if (!editParam) return;
    const line = useBasket.getState().items.find((i) => i.id === editParam);
    const lv = line && product.variants.find((v) => v.id === line.variantId);
    if (!line || !lv) return;
    setEdit({ id: line.id, assetId: line.artwork?.assetId, sourceObjectId: line.artwork?.sourceObjectId });
    useSelection.getState().setSelection(product.key, {
      size: lv.attributes.size,
      colour: lv.attributes.colour,
      orientation: lv.attributes.orientation ?? 'portrait',
    });
    if (line.artwork?.assetId) {
      usePlacements.getState().setPlacement(`${line.artwork.assetId}-${product.key}`, line.artwork.transform);
    }
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const def = product.variants.find((v) => v.isDefault) ?? product.variants[0]!;
    // Prefer a PERSISTED selection (survives the editor round-trip + carries the editor's
    // orientation choice back) over the product default.
    const saved = useSelection.getState().selections[product.key];
    setSize(saved?.size ?? def.attributes.size ?? null);
    setColour(saved?.colour ?? def.attributes.colour ?? null);
    setOrientation(saved?.orientation ?? def.attributes.orientation ?? 'portrait');
    if (saved?.orientation) {
      orientationLockedRef.current = true; // synchronous → the auto-default effect below sees it this same flush
      setOrientationTouched(true); // an explicit/restored choice isn't overridden by the image-aspect auto-default
    }
  }, [product]);

  // Persist the current selection so it survives navigation (edit placement → save &
  // return) and the editor can read/reflect the chosen orientation.
  useEffect(() => {
    if (!product) return;
    useSelection.getState().setSelection(product.key, { size: size ?? undefined, colour: colour ?? undefined, orientation });
  }, [product, size, colour, orientation]);

  // Colours actually available for the selected size — the matrix can be SPARSE (e.g.
  // an 11oz mug in 3 colours but 15oz in white only), so never offer an unavailable combo.
  const coloursForSize = useMemo(() => {
    if (!product) return [];
    const avail = product.variants
      .filter((v) => product.sizes.length === 0 || v.attributes.size === size)
      .map((v) => v.attributes.colour)
      .filter((c): c is string => Boolean(c));
    return [...new Set(avail)];
  }, [product, size]);

  // Keep the chosen colour valid for the chosen size (auto-correct on size change).
  useEffect(() => {
    if (!product || product.colours.length === 0) return;
    if (coloursForSize.length > 0 && (!colour || !coloursForSize.includes(colour))) {
      setColour(coloursForSize[0]!);
    }
  }, [product, coloursForSize, colour]);

  // Chip ↔ strip sync: whichever way a colour is chosen, page the strip so its
  // thumbnail is one of the three on show.
  useEffect(() => {
    if (!colour) return;
    const i = coloursForSize.indexOf(colour);
    if (i < 0) return;
    setThumbIdx((cur) => {
      const max = Math.max(0, coloursForSize.length - 3);
      if (i < cur) return Math.min(i, max);
      if (i > cur + 2) return Math.min(i - 2, max);
      return Math.min(cur, max);
    });
  }, [colour, coloursForSize]);

  // Orientation: auto-defaults to the shape of the uploaded image the first time
  // (a wide drawing suggests a landscape frame); the shopper can override any time.
  useEffect(() => {
    if (!product || product.orientations.length === 0 || orientationTouched || orientationLockedRef.current || !upload?.dataUrl) return;
    const img = new window.Image();
    img.onload = () => {
      if (!orientationLockedRef.current && img.naturalWidth > 0 && img.naturalHeight > 0) {
        setOrientation(img.naturalWidth > img.naturalHeight ? 'landscape' : 'portrait');
      }
    };
    img.src = upload.dataUrl;
  }, [product, upload?.dataUrl, orientationTouched]);

  // Exact match for the chosen size+colour+orientation — NO silent fallback to the
  // default, which would order + charge the WRONG variant. null ⇒ not available.
  const variant = useMemo(() => {
    if (!product) return null;
    return (
      product.variants.find(
        (v) =>
          (product.sizes.length === 0 || v.attributes.size === size) &&
          (product.colours.length === 0 || v.attributes.colour === colour) &&
          (product.orientations.length === 0 || (v.attributes.orientation ?? 'portrait') === orientation),
      ) ?? null
    );
  }, [product, size, colour, orientation]);

  if (products && !product) {
    return (
      <Shell>
        <p className="py-16 text-center text-sm text-[#6F6358]">
          That product isn’t available. <Link href="/start-creating" className="font-bold text-cinnamon">back to the range</Link>.
        </p>
      </Shell>
    );
  }
  if (!product) {
    return (
      <Shell>
        <div className="py-16 text-center text-sm text-[#9C8E7E]">loading…</div>
      </Shell>
    );
  }

  const previewImg = upload?.cutout?.url ?? upload?.dataUrl ?? null;
  // The asset this screen acts on: in edit mode the basket line's own asset wins (so a line
  // placed under an earlier drawing edits the right image); otherwise the current upload.
  const activeAssetId = edit?.assetId ?? upload?.assetId ?? null;
  const activeSource = edit?.sourceObjectId ?? upload?.cutout?.sourceObjectId;
  const placement = (activeAssetId && placements[`${activeAssetId}-${product.key}`]) || defaultTransformFor(product.key);

  const editPlacement = () => {
    if (!activeAssetId) {
      toast('upload a drawing first');
      return;
    }
    if (!variant) {
      toast('pick a size + colour first');
      return;
    }
    // Scoped to THIS product + variant — the positioner edits this creation's placement only.
    // Keep ?edit through the round-trip so "save & return" lands back in edit mode.
    const ret = `/customize/${product.key}${edit ? `?edit=${encodeURIComponent(edit.id)}` : ''}`;
    router.push(`/studio/position?draft=${activeAssetId}&variant=${variant.id}&return=${encodeURIComponent(ret)}`);
  };

  const addToBasket = () => {
    if (!activeAssetId) {
      toast('upload a drawing first');
      return;
    }
    if (!variant) {
      toast('that size + colour isn’t available — pick another');
      return;
    }
    const sub = [variant.attributes.size, variant.attributes.colour, variant.attributes.orientation === 'landscape' ? 'landscape' : null].filter(Boolean).join(' · ') || undefined;
    const fields = {
      name: product.label,
      product: product.key as ProductKey,
      sku: variant.sku,
      variantId: variant.id,
      pricePence: variant.pricePence,
      sub,
      artwork: { assetId: activeAssetId, transform: placement, sourceObjectId: activeSource },
    };
    if (edit) {
      // Update this exact line in place; if the variant changed, re-key to the new
      // variant's line id (merging if that line already exists) — the store handles it.
      update(edit.id, fields, lineIdForSku(variant.sku));
      toast('basket updated ✓');
    } else {
      add({ id: lineIdForSku(variant.sku), ...fields });
      toast('added to basket ✓');
    }
    router.push('/start-creating');
  };

  return (
    <Shell>
      {/* Big close-up: near-fullscreen on mobile, large on desktop. */}
      <Modal open={zoomOpen} onClose={() => setZoomOpen(false)} size="xl" fill title={product.label} subtitle={gbp(variant?.pricePence ?? product.fromPence)}>
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-[#FBF5E9] p-3">
          <MockupPreview
            productKey={product.key as ProductKey}
            assetId={activeAssetId}
            variantId={variant?.id ?? null}
            transform={placement}
            size="zoom"
            sourceObjectId={activeSource ?? null}
            px={720}
          />
        </div>
      </Modal>
      <div className="grid gap-7 md:grid-cols-2 md:items-start">
        {/* Left: ONE photo preview (+20% vs the old view) with the colour strip under it */}
        <div>
          {canSpin ? (
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="preview view">
              {(['photo', 'spin'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setView(m)}
                  aria-pressed={view === m}
                  className={`relative rounded-full border px-3 py-1 text-[11px] font-bold before:absolute before:-inset-[6px] before:content-[''] ${view === m ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                >
                  {m === 'photo' ? 'photo' : 'spin it around'}
                </button>
              ))}
            </div>
          ) : null}
          <div className="relative flex items-center justify-center rounded-3xl border border-[#EADFC9] bg-[#FBF5E9] p-4">
            {view === 'spin' && canSpin && previewImg && variant?.printWmm && variant?.printHmm ? (
              <div className="h-96 w-full">
                <Product3D
                  kind={product.key}
                  image={previewImg}
                  fallbackImage={upload?.dataUrl ?? null}
                  placement={placement}
                  printWmm={variant.printWmm}
                  printHmm={variant.printHmm}
                  attributes={variant.attributes}
                />
              </div>
            ) : (
              <>
                <MockupPreview
                  productKey={product.key as ProductKey}
                  assetId={activeAssetId}
                  variantId={variant?.id ?? null}
                  transform={placement}
                  size="zoom"
                  sourceObjectId={activeSource ?? null}
                  px={360}
                />
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  aria-label={`Enlarge ${product.label} preview`}
                  className="absolute left-2.5 top-2.5 flex items-center justify-center rounded-full bg-white/85 p-1.5 text-[#7A6A58] shadow-sm before:absolute before:-inset-[8px] before:content-[''] hover:text-cinnamon"
                >
                  <Icon icon={IconZoomScan} size={17} />
                </button>
              </>
            )}
          </div>
          {view === 'spin' && canSpin ? (
            <p className="mt-1.5 text-center text-[11px] text-[#9C8E7E]">drag to spin · the photo view shows the exact print</p>
          ) : null}
          {/* Colour strip: one thumbnail per colour, 3 visible, arrows to cycle.
              A tap selects that colour (and the chips stay in sync). */}
          {coloursForSize.length > 1 ? (
            <div className="mt-3 flex items-center gap-2" role="group" aria-label="colour previews">
              <button
                type="button"
                onClick={() => setThumbIdx((i) => Math.max(0, i - 1))}
                disabled={thumbIdx === 0}
                aria-label="previous colours"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EFE6D6] bg-white text-[#7A6A58] before:absolute before:-inset-[4px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
              >
                <Icon icon={IconChevronLeft} size={17} />
              </button>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div
                  className="flex gap-2 motion-safe:transition-transform motion-safe:duration-200"
                  style={{ transform: `translateX(calc(${-thumbIdx} * (33.333% + 0.1667rem)))` }}
                >
                  {coloursForSize.map((c) => {
                    const cv = product.variants.find(
                      (v) =>
                        (product.sizes.length === 0 || v.attributes.size === size) &&
                        v.attributes.colour === c &&
                        (product.orientations.length === 0 || (v.attributes.orientation ?? 'portrait') === orientation),
                    );
                    if (!cv) return null;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColour(c)}
                        aria-label={`${c} ${product.label}`}
                        aria-pressed={colour === c}
                        className={`aspect-square w-[calc((100%-1rem)/3)] shrink-0 overflow-hidden rounded-xl border-2 bg-[#FBF5E9] p-1 ${colour === c ? 'border-cinnamon' : 'border-[#EFE6D6] hover:border-[#E0C7A8]'}`}
                      >
                        <MockupPreview
                          productKey={product.key as ProductKey}
                          assetId={activeAssetId}
                          variantId={cv.id}
                          transform={placement}
                          size="thumb"
                          sourceObjectId={activeSource ?? null}
                          px={110}
                          lazy
                        />
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setThumbIdx((i) => Math.min(Math.max(0, coloursForSize.length - 3), i + 1))}
                disabled={thumbIdx >= coloursForSize.length - 3}
                aria-label="more colours"
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#EFE6D6] bg-white text-[#7A6A58] before:absolute before:-inset-[4px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
              >
                <Icon icon={IconChevronRight} size={17} />
              </button>
            </div>
          ) : null}
          <Button variant="design" size="lg" className="mt-3 w-full" onClick={editPlacement}>
            <Icon icon={IconPencil} size={15} /> edit placement
          </Button>
        </div>

        {/* Right: options → description → add to basket (bottom-right) */}
        <div className="flex flex-col">
          <h1 className="font-display text-3xl font-semibold text-cocoa">{product.label}</h1>
          {product.blurb ? <p className="mt-1 text-sm text-[#6F6358]">{product.blurb}</p> : null}
          <div className="mt-2 font-display text-2xl font-semibold text-cinnamon">{gbp(variant?.pricePence ?? product.fromPence)}</div>
          <p className="text-[11px] text-[#9C8E7E]">free tracked delivery</p>

          {product.sizes.length > 0 ? <Picker label="Size" options={product.sizes} value={size} onChange={setSize} /> : null}
          {product.orientations.length > 0 ? (
            <Picker
              label="Orientation"
              options={product.orientations}
              value={orientation}
              onChange={(o) => {
                orientationLockedRef.current = true;
                setOrientationTouched(true);
                setOrientation(o);
              }}
            />
          ) : null}
          {product.colours.length > 0 ? <Picker label="Colour" options={coloursForSize} value={colour} onChange={setColour} swatch /> : null}

          {/* collapsible, scrollable-in-container description */}
          {product.description ? (
            <div className="mt-5 rounded-xl border border-[#EFE6D6] bg-white">
              <button
                type="button"
                onClick={() => setDescOpen((o) => !o)}
                aria-expanded={descOpen}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-bold text-cocoa"
              >
                product details
                <Icon icon={IconChevronDown} size={16} className={`text-[#9C8E7E] transition-transform ${descOpen ? 'rotate-180' : ''}`} />
              </button>
              {descOpen ? (
                <div className="brand-scroll max-h-44 overflow-y-auto border-t border-[#EFE6D6] px-4 py-3 text-[13px] leading-relaxed text-[#6F6358]">
                  <p>{product.description}</p>
                  {Object.keys(product.specs).length > 0 ? (
                    <dl className="mt-3 space-y-1">
                      {Object.entries(product.specs).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="min-w-20 font-semibold capitalize text-[#8A7C6A]">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-6 flex justify-end">
            <Button size="lg" className="w-full sm:w-auto" onClick={addToBasket} disabled={!variant}>
              <Icon icon={edit ? IconCircleCheck : IconShoppingBag} size={16} /> {edit ? 'update basket' : 'add to basket'} · {gbp(variant?.pricePence ?? product.fromPence)}
            </Button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
  swatch = false,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  swatch?: boolean;
}) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              value === o ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58] hover:border-honey'
            }`}
          >
            {swatch ? <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatchColour(o) }} /> : null}
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function swatchColour(name: string): string {
  const map: Record<string, string> = {
    oak: '#C8A06A', black: '#2E2723', white: '#F7F2E8', sky: '#84BBD0', pink: '#E8A6B8',
    natural: '#E7D9BE', gold: '#D9B45B', blue: '#5B8AC0', 'caribbean blue': '#3FA9C9', 'cotton pink': '#E8A6B8',
    brown: '#6B4A32', 'dark grey': '#4D4C4A', 'light grey': '#CFCDC8', silver: '#B9B6AE',
  };
  return map[name] ?? '#E0C7A8';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <header className="flex items-center gap-3 border-b border-[#EDE2CD] px-6 py-3.5">
        <Link href="/start-creating" aria-label="Back to your range">
          <Icon icon={IconArrowLeft} size={20} className="text-[#7A6A58]" />
        </Link>
        <Link href="/" className="font-display text-xl font-semibold text-cocoa">snickerdoodle</Link>
      </header>
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-6 py-7">{children}</main>
    </div>
  );
}
