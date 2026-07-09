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
import { gbp, toast, useBasket, usePlacements, useSelection, useUpload, type CardMessage } from '@/lib/store';
import { CARD_FONTS, CARD_FONT_DEFAULT, cardFontCss } from '@/lib/card-fonts';
import { CUSHION_BACK_COLOURS, CUSHION_BACK_MATCH, CUSHION_BACK_SWATCHES, CUSHION_BACK_WHITE, CUSHION_SUEDE_BACK_HEX, cushionBackHex, cushionSidesForBack, cushionSupportsBack, defaultTransformFor, lineIdForSku, sizeDimsCm } from '@/lib/catalogue-view';
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
  // Alternate mockup VIEW (the jigsaw's companion tin): 'primary' = the product itself,
  // 'tin' = the drawing on the keepsake-tin lid (a perspective mockup).
  const [mockupView, setMockupView] = useState<'primary' | 'tin'>('primary');
  // Colour thumbnail strip paging (3 visible at a time).
  const [thumbIdx, setThumbIdx] = useState(0);
  // CUSHION back (double-sided-capable squares): 'both' = the same image both sides, or a
  // colour token → image front + that plain back. `showBack` = the "turn it around" preview.
  const [back, setBack] = useState<string>(CUSHION_BACK_WHITE);
  const [showBack, setShowBack] = useState(false);
  // GREETINGS CARD inside message (card only): null = blank inside (write it by hand).
  const [cardMessage, setCardMessage] = useState<CardMessage | null>(null);
  // Which card view the big preview shows — one hero + a thumbnail strip beneath (founder spec):
  // 'single' (card-on-envelope) · 'outside' (the unfolded outside) · 'inside' (the message; only
  // offered once a message is being added).
  const [cardView, setCardView] = useState<'single' | 'outside' | 'inside'>('single');
  // Outside image span: the drawing on the front panel only ('front', default) or across the
  // whole outside ('full'). Only meaningful in the outside view.
  const [cardSpan, setCardSpan] = useState<'full' | 'front'>('front');
  useEffect(() => {
    setCanSpin(has3D(productKey) && webglOk());
    setView('photo'); // reset when the product changes
    setMockupView('primary');
    setThumbIdx(0);
    setShowBack(false);
    setCardView('single');
    setCardSpan('front');
    setCardMessage(null);
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
    const sp = new URLSearchParams(window.location.search);
    const editParam = sp.get('edit');
    editSeededRef.current = true;
    if (!editParam) return;
    const line = useBasket.getState().items.find((i) => i.id === editParam);
    const lv = line && product.variants.find((v) => v.id === line.variantId);
    if (!line || !lv) return;
    setEdit({ id: line.id, assetId: line.artwork?.assetId, sourceObjectId: line.artwork?.sourceObjectId });
    // Returning from the positioner (resume=1): the selection + placement stores already
    // hold the user's IN-PROGRESS edits (the new placement, a toggled orientation) — re-seeding
    // from the still-unchanged basket line would clobber them. Only seed on FIRST entry from
    // the basket. (Fresh entry without resume DOES re-seed, resetting any unsaved stray edits.)
    if (sp.get('resume')) return;
    useSelection.getState().setSelection(product.key, {
      size: lv.attributes.size,
      colour: lv.attributes.colour,
      orientation: lv.attributes.orientation ?? 'portrait',
      back: line.back, // a cushion line carries its back choice
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
    setBack(saved?.back ?? CUSHION_BACK_WHITE);
    setCardMessage(saved?.message ?? null);
    setCardSpan(saved?.cardImageSpan ?? 'front');
    if (saved?.orientation) {
      orientationLockedRef.current = true; // synchronous → the auto-default effect below sees it this same flush
      setOrientationTouched(true); // an explicit/restored choice isn't overridden by the image-aspect auto-default
    }
  }, [product]);

  // Persist the current selection so it survives navigation (edit placement → save &
  // return) and the editor can read/reflect the chosen orientation.
  useEffect(() => {
    if (!product) return;
    useSelection.getState().setSelection(product.key, { size: size ?? undefined, colour: colour ?? undefined, orientation, back, message: cardMessage ?? undefined, cardImageSpan: cardSpan });
  }, [product, size, colour, orientation, back, cardMessage, cardSpan]);

  // CUSHION back: only the DUAL squares offer a colour / both-sides back; heart + round show a
  // white reverse. `backFill` drives the "turn it around" preview — undefined = the image (both
  // sides, or the front); a hex = a plain coloured/white back rendered plush via the fill mode.
  const supportsBack = product?.key === 'cushion' && cushionSupportsBack(size);
  const backFill: string | undefined =
    product?.key !== 'cushion'
      ? undefined
      : !supportsBack
        ? CUSHION_SUEDE_BACK_HEX // heart / round: fixed faux-suede stone reverse
        : back === CUSHION_BACK_MATCH
          ? undefined // image both sides = the image itself
          : back === CUSHION_BACK_WHITE
            ? '#FFFFFF' // plain white back (single-sided linen)
            : cushionBackHex(back) ?? undefined; // a plain colour back (double-sided)

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

  // Cushion: the `size` attribute encodes shape+size (heart / 18″ round / 12″ square / 22″
  // square). The shape STRIP groups by shape so the two square sizes share ONE square
  // thumbnail (the Size chips still pick the exact 12″/22″). Selecting a thumbnail OR a chip
  // keeps them in sync — both drive `size`. Three shapes fit the row, so no paging.
  const cushionShapeOf = (sz: string | null): string =>
    !sz ? '' : /round/i.test(sz) ? 'round' : /square/i.test(sz) ? 'square' : /heart/i.test(sz) ? 'heart' : sz;
  const shapeStrip: { shape: string; size: string; variantId: string }[] = [];
  if (product?.key === 'cushion') {
    const seen = new Set<string>();
    for (const v of product.variants) {
      const shape = cushionShapeOf(v.attributes.size ?? null);
      if (!shape || seen.has(shape)) continue;
      seen.add(shape);
      shapeStrip.push({ shape, size: v.attributes.size!, variantId: v.id });
    }
  }

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
    // Cushion squares carry a `sides` axis (single vs double-sided); the back choice picks which
    // SKU (+ price). Heart/round + every other product have no sides attribute → match undefined.
    const wantSides = product.key === 'cushion' && cushionSupportsBack(size) ? cushionSidesForBack(back) : undefined;
    return (
      product.variants.find(
        (v) =>
          (product.sizes.length === 0 || v.attributes.size === size) &&
          (product.colours.length === 0 || v.attributes.colour === colour) &&
          (product.orientations.length === 0 || (v.attributes.orientation ?? 'portrait') === orientation) &&
          (v.attributes.sides ?? undefined) === wantSides,
      ) ?? null
    );
  }, [product, size, colour, orientation, back]);

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
    // Keep ?edit through the round-trip so "save & return" lands back in edit mode, and mark
    // it resume=1 so we DON'T re-seed over the placement the positioner just saved.
    const ret = `/customize/${product.key}${edit ? `?edit=${encodeURIComponent(edit.id)}&resume=1` : ''}`;
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
    const backLabel = supportsBack
      ? back === CUSHION_BACK_WHITE
        ? 'white back'
        : back === CUSHION_BACK_MATCH
          ? 'both sides'
          : `${CUSHION_BACK_COLOURS.find((c) => c.token === back)?.label ?? ''} back`
      : null;
    // CARD inside message — only attach if it actually has content (all-empty = blank inside).
    const cardMsg: CardMessage | undefined =
      product.key === 'card' && cardMessage && (cardMessage.greeting.trim() || cardMessage.message.trim() || cardMessage.signature.trim())
        ? { greeting: cardMessage.greeting.trim(), message: cardMessage.message.trim(), signature: cardMessage.signature.trim(), font: cardMessage.font }
        : undefined;
    const cardSpanLabel = product.key === 'card' && cardSpan === 'full' ? 'full-width' : null;
    const sub = [variant.attributes.size, variant.attributes.colour, variant.attributes.orientation === 'landscape' ? 'landscape' : null, backLabel, cardSpanLabel, cardMsg ? 'with a message' : null].filter(Boolean).join(' · ') || undefined;
    const fields = {
      name: product.label,
      product: product.key as ProductKey,
      sku: variant.sku,
      variantId: variant.id,
      pricePence: variant.pricePence,
      sub,
      artwork: { assetId: activeAssetId, transform: placement, sourceObjectId: activeSource },
      back: supportsBack ? back : undefined, // cushion back choice (the DUAL squares only)
      message: cardMsg, // card inside message (card only)
      cardImageSpan: product.key === 'card' ? cardSpan : undefined, // outside image span (card only)
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
            view={mockupView === 'tin' ? 'tin' : undefined}
            fill={showBack ? backFill : undefined}
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
            ) : product.key === 'card' && cardView === 'inside' ? (
              // The INSIDE of the card — the message laid out in the chosen font (a live text
              // preview; the photoreal inside mockup + text-quads follow in the inside-view work).
              <CardInsidePreview message={cardMessage} />
            ) : (
              <>
                <MockupPreview
                  productKey={product.key as ProductKey}
                  assetId={activeAssetId}
                  variantId={variant?.id ?? null}
                  transform={placement}
                  size="zoom"
                  sourceObjectId={activeSource ?? null}
                  view={
                    product.key === 'card'
                      ? cardView === 'outside'
                        ? `outside-${cardSpan}`
                        : undefined // 'single' → the primary card-on-envelope mockup
                      : mockupView === 'tin'
                        ? 'tin'
                        : undefined
                  }
                  fill={showBack ? backFill : undefined}
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
          {/* Cushion "turn it around" — flip the preview between the image side and the back
              (the chosen colour, or the plain white reverse for heart/round). */}
          {product.key === 'cushion' ? (
            <div className="mt-2 flex items-center justify-center gap-1.5" role="group" aria-label="turn it around">
              {([['the front', false], ['the back', true]] as const).map(([label, b]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setShowBack(b)}
                  aria-pressed={showBack === b}
                  className={`relative rounded-full border px-3 py-1 text-[11px] font-bold before:absolute before:-inset-[6px] before:content-[''] ${showBack === b ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          {/* Card views — one big preview + a thumbnail strip beneath: Single Card View · Outside
              Open · Inside Open (the last only once a message is being added). Tapping a thumbnail
              switches the big preview (mirrors the jigsaw's view thumbnails). */}
          {product.key === 'card' ? (
            <>
              <div className="mt-3 flex items-center gap-2" role="group" aria-label="card view">
                {((cardMessage ? ['single', 'outside', 'inside'] : ['single', 'outside']) as ('single' | 'outside' | 'inside')[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setCardView(v)}
                    aria-pressed={cardView === v}
                    aria-label={v === 'single' ? 'single card' : v === 'outside' ? 'outside of the card' : 'inside of the card'}
                    className={`aspect-square w-[calc((100%-1rem)/3)] shrink-0 overflow-hidden rounded-xl border-2 bg-[#FBF5E9] p-1 ${cardView === v ? 'border-cinnamon' : 'border-[#EFE6D6] hover:border-[#E0C7A8]'}`}
                  >
                    {v === 'inside' ? (
                      <CardInsidePreview message={cardMessage} compact />
                    ) : (
                      <MockupPreview
                        productKey={product.key as ProductKey}
                        assetId={activeAssetId}
                        variantId={variant?.id ?? null}
                        transform={placement}
                        size="thumb"
                        sourceObjectId={activeSource ?? null}
                        view={v === 'outside' ? `outside-${cardSpan}` : undefined}
                        px={120}
                        lazy
                      />
                    )}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {/* Jigsaw: two small thumbnails beneath the preview — the puzzle itself and the
              drawing on the keepsake tin — that switch the main preview when tapped. */}
          {product.key === 'jigsaw' ? (
            <div className="mt-3 flex items-center gap-2" role="group" aria-label="preview view">
              {([['primary', 'the puzzle'], ['tin', 'the tin']] as const).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setMockupView(v)}
                  aria-pressed={mockupView === v}
                  aria-label={label}
                  className={`aspect-square w-[calc((100%-1rem)/3)] shrink-0 overflow-hidden rounded-xl border-2 bg-[#FBF5E9] p-1 ${mockupView === v ? 'border-cinnamon' : 'border-[#EFE6D6] hover:border-[#E0C7A8]'}`}
                >
                  <MockupPreview
                    productKey={product.key as ProductKey}
                    assetId={activeAssetId}
                    variantId={variant?.id ?? null}
                    transform={placement}
                    size="thumb"
                    sourceObjectId={activeSource ?? null}
                    view={v === 'tin' ? 'tin' : undefined}
                    px={120}
                    lazy
                  />
                </button>
              ))}
            </div>
          ) : null}
          {/* Cushion shape strip: heart / round / square as small thumbnails (the two square
              sizes share the square thumbnail — the Size chips pick 12″/22″). Tap a thumbnail
              OR a Size chip; they stay in sync. Mirrors the frame's colour strip. */}
          {shapeStrip.length > 1 ? (
            <div className="mt-3 flex items-center gap-2" role="group" aria-label="cushion shape">
              {shapeStrip.map((e) => (
                <button
                  key={e.shape}
                  type="button"
                  onClick={() => { if (cushionShapeOf(size) !== e.shape) setSize(e.size); }}
                  aria-pressed={cushionShapeOf(size) === e.shape}
                  aria-label={`${e.shape} cushion`}
                  className={`aspect-square w-[calc((100%-1rem)/3)] shrink-0 overflow-hidden rounded-xl border-2 bg-[#FBF5E9] p-1 ${cushionShapeOf(size) === e.shape ? 'border-cinnamon' : 'border-[#EFE6D6] hover:border-[#E0C7A8]'}`}
                >
                  <MockupPreview
                    productKey={product.key as ProductKey}
                    assetId={activeAssetId}
                    variantId={e.variantId}
                    transform={placement}
                    size="thumb"
                    sourceObjectId={activeSource ?? null}
                    px={110}
                    lazy
                  />
                </button>
              ))}
            </div>
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

          {/* A single-size product needs no picker — the size lives in the product details. */}
          {product.sizes.length > 1 ? (
            <Picker
              label="Size"
              options={product.sizes}
              value={size}
              onChange={setSize}
              // Show the physical size under word-sized buttons (the blanket's medium/large); the
              // frame/jigsaw/mug sizes already state their own measure in the name.
              describe={product.key === 'blanket' ? (s) => sizeDimsCm(product, s) : undefined}
            />
          ) : null}
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

          {/* CUSHION back: pick a back colour (white is the single-sided default; any other colour
              is a double-sided upgrade) or 'image both sides'. heart + round are single-sided.
              Tapping flips the preview. */}
          {product.key === 'cushion' && supportsBack ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">The back</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {CUSHION_BACK_SWATCHES.map((c) => (
                  <button
                    key={c.token}
                    type="button"
                    onClick={() => { setBack(c.token); setShowBack(true); }}
                    aria-pressed={back === c.token}
                    aria-label={`${c.label} back`}
                    title={c.label}
                    className={`h-8 w-8 rounded-full border-2 ${back === c.token ? 'border-cinnamon ring-2 ring-cinnamon/30' : 'border-[#D9CDB8] hover:border-[#E0C7A8]'}`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => { setBack(CUSHION_BACK_MATCH); setShowBack(true); }}
                  aria-pressed={back === CUSHION_BACK_MATCH}
                  className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${back === CUSHION_BACK_MATCH ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                >
                  image both sides
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-[#9C8E7E]">
                {back === CUSHION_BACK_WHITE
                  ? 'white back · single-sided'
                  : back === CUSHION_BACK_MATCH
                    ? 'your image, printed on both sides · double-sided'
                    : `image on the front · ${CUSHION_BACK_SWATCHES.find((c) => c.token === back)?.label ?? ''} back · double-sided`}
              </p>
            </div>
          ) : product.key === 'cushion' ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">The back</p>
              <p className="mt-1.5 text-[11px] text-[#9C8E7E]">your image on the front · soft stone back</p>
            </div>
          ) : null}

          {/* CARD outside: the drawing on the front panel only, or spanning the whole outside. A
              purchase option — picking one shows the outside view so the shopper sees the effect. */}
          {product.key === 'card' ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">The outside</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {([['front only', 'front'], ['full width', 'full']] as const).map(([label, span]) => (
                  <button
                    key={span}
                    type="button"
                    onClick={() => { setCardSpan(span); setCardView('outside'); }}
                    aria-pressed={cardSpan === span}
                    className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${cardSpan === span ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-[#9C8E7E]">
                {cardSpan === 'full' ? 'the drawing spans the whole outside, across the fold' : 'the drawing on the front; the back stays plain'}
              </p>
            </div>
          ) : null}

          {/* CARD inside: leave it blank (write by hand) or add a printed message — three fields
              (greeting / message / signature) in a chosen font, auto-fit to the card inside. */}
          {product.key === 'card' ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">The inside</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCardMessage(null)}
                  aria-pressed={cardMessage === null}
                  className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${cardMessage === null ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                >
                  leave it blank
                </button>
                <button
                  type="button"
                  onClick={() => { setCardMessage((m) => m ?? { greeting: '', message: '', signature: '', font: CARD_FONT_DEFAULT }); setCardView('inside'); }}
                  aria-pressed={cardMessage !== null}
                  className={`rounded-full border-2 px-3 py-1.5 text-xs font-bold ${cardMessage !== null ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                >
                  add a message
                </button>
              </div>
              {cardMessage === null ? (
                <p className="mt-1.5 text-[11px] text-[#9C8E7E]">left blank for you to write in by hand</p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {([
                    ['Greeting', 'greeting', 'Happy Birthday!', 80, 2],
                    ['Message', 'message', 'Hope your special day is full of cake and fun…', 600, 4],
                    ['Signature', 'signature', 'love, Mabel x', 80, 2],
                  ] as const).map(([label, key, placeholder, max, rows]) => (
                    <label key={key} className="block">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">{label}</span>
                      <textarea
                        value={cardMessage[key]}
                        onChange={(e) => setCardMessage({ ...cardMessage, [key]: e.target.value.slice(0, max) })}
                        onFocus={() => setCardView('inside')}
                        placeholder={placeholder}
                        rows={rows}
                        maxLength={max}
                        className="mt-1 w-full resize-none rounded-xl border border-[#E0C7A8] bg-[#FFFDF8] px-3 py-2 text-sm text-cocoa placeholder:text-[#B7A890] focus:border-cinnamon focus:outline-none"
                      />
                    </label>
                  ))}
                  <div>
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">Font</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {CARD_FONTS.map((f) => (
                        <button
                          key={f.token}
                          type="button"
                          onClick={() => setCardMessage({ ...cardMessage, font: f.token })}
                          aria-pressed={cardMessage.font === f.token}
                          className={`rounded-full border-2 px-3 py-1.5 text-base leading-none ${cardMessage.font === f.token ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58]'}`}
                          style={{ fontFamily: f.css }}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[11px] text-[#9C8E7E]">screened before print · appears on the inside right</p>
                </div>
              )}
            </div>
          ) : null}

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

/**
 * A live preview of the card's INSIDE — the message laid out on the inside-right page in the
 * chosen font (greeting on top, message in the middle, signature at the foot). A styled text
 * preview for now; the photoreal inside mockup follows once the founder's card assets land and
 * the print renderer auto-fits each field to its real inside zone. Empty ⇒ a gentle placeholder.
 */
function CardInsidePreview({ message, compact = false }: { message: CardMessage | null; compact?: boolean }) {
  const empty = !message || (!message.greeting.trim() && !message.message.trim() && !message.signature.trim());
  return (
    <div className={`flex w-full items-center justify-center ${compact ? 'h-full' : 'h-96'}`}>
      <div
        className={`flex aspect-[5/7] max-h-full flex-col rounded-lg border border-[#EADFC9] bg-white text-cocoa ${compact ? 'px-1.5 py-2' : 'h-full px-5 py-6 shadow-[0_2px_10px_rgba(46,39,35,.08)]'}`}
        style={{ fontFamily: cardFontCss(message?.font) }}
      >
        {empty ? (
          <div className="m-auto text-center text-sm text-[#B7A890]" style={{ fontFamily: 'var(--font-sans)' }}>
            your message will appear here
          </div>
        ) : (
          <>
            {message!.greeting.trim() ? <p className="whitespace-pre-wrap break-words text-center text-2xl leading-snug">{message!.greeting}</p> : null}
            {message!.message.trim() ? (
              <p className="mt-3 flex-1 whitespace-pre-wrap break-words text-lg leading-snug">{message!.message}</p>
            ) : (
              <div className="flex-1" />
            )}
            {message!.signature.trim() ? <p className="mt-3 whitespace-pre-wrap break-words text-right text-xl leading-snug">{message!.signature}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Picker({
  label,
  options,
  value,
  onChange,
  swatch = false,
  describe,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  swatch?: boolean;
  /** Optional small sub-label under an option (e.g. a size's dimensions). */
  describe?: (o: string) => string | undefined;
}) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#A2937F]">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const sub = describe?.(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
                value === o ? 'border-cinnamon bg-[#FBEFE0] text-cocoa' : 'border-[#EFE6D6] bg-white text-[#7A6A58] hover:border-honey'
              }`}
            >
              {swatch ? <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ backgroundColor: swatchColour(o) }} /> : null}
              {sub ? (
                <span className="flex flex-col items-start leading-tight">
                  <span>{o}</span>
                  <span className="text-[10px] font-medium text-[#A2937F]">{sub}</span>
                </span>
              ) : (
                o
              )}
            </button>
          );
        })}
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
