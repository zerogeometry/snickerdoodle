'use client';

import { IconAlertTriangle, IconHeartPlus, IconChevronDown, IconChevronLeft, IconChevronRight, IconCircleCheck, IconPencil, IconShoppingBag, IconZoomScan } from '@tabler/icons-react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Modal } from '@/ui/primitives/Modal';
import { Icon } from '@/ui/primitives/Icon';
import { type ProductKey } from '@/ui/components/ProductArt';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { deliveryLine } from '@/lib/delivery';
import { ChristmasPromise } from '@/ui/components/ChristmasPromise';
import { FlowHeader } from '@/ui/components/FlowHeader';
import { gbp, toast, useBasket, usePlacements, useSelection, useUpload, useUploadHydrated, type CardMessage } from '@/lib/store';
import { CARD_FONTS, CARD_FONT_DEFAULT, cardFontCss } from '@/lib/card-fonts';
import { fitCardFontSize } from '@/lib/cardTextFit';
import { CUSHION_BACK_COLOURS, CUSHION_BACK_MATCH, CUSHION_BACK_SWATCHES, CUSHION_BACK_WHITE, CUSHION_SUEDE_BACK_HEX, MUG_SWATCH, cushionBackHex, cushionSidesForBack, cushionSupportsBack, defaultTransformFor, sizeDimsCm } from '@/lib/catalogue-view';
import { basketLineId } from '@/lib/basket-line';
import { colourName, isColouredGround, isGroundProduct, isPatternProduct, PATTERN_GROUND_WHITE } from '@/lib/patterns';
import { BaseColourPicker } from '@/ui/components/BaseColourPicker';
import { removeBackgroundAction } from '@/app/actions/magic';
import { TOO_MANY_COPY } from '@/lib/rateLimitCopy';
import { garmentHex, isDarkGarment, isGarmentKey } from '@/lib/garments';
import { CASE_GRADE_BLURB, gradesFor } from '@/lib/phone-cases';
import { PhoneModelPicker } from '@/ui/components/PhoneModelPicker';
import { CardPackBuilder } from '@/ui/components/CardPackBuilder';
import { isCardPackKey } from '@/lib/card-packs';
import { CalendarBuilder } from '@/ui/components/CalendarBuilder';
import { isCalendarKey } from '@/lib/calendar';
import { cachedCatalogue, loadCatalogueCached } from '@/lib/catalogueCache';
import { saveDesignAction } from '@/app/actions/designs';
import { has3D } from '@/ui/three/spinnable';
import type { CatalogueProduct } from '@/server/catalogue';
import { clampTransform, type ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';

// Tier-C 3D spin view — lazy, so three.js never loads unless someone opens it.
// (The framed print deliberately has NO 3D/wall views — founder call 2026-07-07:
// one perfect photo view; the spin stays for other products' curation.)
const Product3D = dynamic(() => import('@/ui/three/Product3D'), {
  ssr: false,
  loading: () => <div className="flex h-full w-full items-center justify-center text-xs text-ink-faint">warming up the spin view…</div>,
});

function webglOk(): boolean {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}

/** What the base colour colours, in the shopper's words. A greetings card takes it on the front
 * (the whole outside when the drawing spans it — see groundNoun below); the inside stays white. */
const GROUND_NOUN: Record<string, string> = {
  socks: 'sock', teaTowel: 'towel', wrappingPaper: 'paper', phoneCase: 'case', cushion: 'cushion', blanket: 'blanket',
  jigsaw: 'puzzle', framedPrint: 'print', playingCards: 'card back', petBandana: 'bandana', card: 'card front',
};

/** A card PACK gets its own builder (N drawings, one line); every other product the customizer. */
export default function CustomizePage() {
  const params = useParams<{ productKey: string }>();
  if (isCardPackKey(params.productKey)) return <CardPackBuilder />;
  if (isCalendarKey(params.productKey)) return <CalendarBuilder />; // 13 pages: its own picker + flip-through
  return <CustomizeProduct />;
}

/**
 * Customize a product: size + colour + placement only. Image-level edits (remove
 * background, the studio) live on the catalogue page and apply to every product —
 * here we just place the (already-edited) image on this product.
 */
function CustomizeProduct() {
  const router = useRouter();
  const params = useParams<{ productKey: string }>();
  const productKey = params.productKey;

  const upload = useUpload((s) => s.upload);
  // this tab's drawing is read just after mount (src/lib/uploadSession.ts) — don't say it's missing before then
  const uploadReady = useUploadHydrated();
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
  // phone cases: snap | tough, gloss | matte (size = the phone model)
  const [grade, setGrade] = useState<string | null>(null);
  const [finish, setFinish] = useState<string | null>(null);
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
  // REPEAT-PATTERN base colour (socks, wrapping paper, tea towel): the repeat sits on it. White default.
  const [ground, setGround] = useState<string>(PATTERN_GROUND_WHITE);
  const [lifting, setLifting] = useState(false); // the one-tap 'lift it off the paper' magic edit
  // MUG: three real-photo wrap views — the centred hero (design middle, handle hidden), the front
  // (right side of the image) and the back (left side). Centre leads.
  const [mugSide, setMugSide] = useState<'centre' | 'front' | 'back'>('centre');
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
    setMugSide('centre');
    setCardView('single');
    setCardSpan('front');
    setCardMessage(null);
  }, [productKey]);

  useEffect(() => {
    // ?all=1 = the DEV curation view (customize a hidden product before it graduates);
    // the server action refuses includeHidden in production.
    const includeHidden = new URLSearchParams(window.location.search).get('all') === '1';
    // the range page's copy of the list first, so this page opens at once (refreshed behind)
    const copy = cachedCatalogue(includeHidden);
    if (copy) setProducts(copy);
    // an unchanged list keeps the same object, so nothing on the page re-initialises
    void loadCatalogueCached(includeHidden).then((fresh) => setProducts((cur) => (cur && JSON.stringify(cur) === JSON.stringify(fresh) ? cur : fresh)));
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
      grade: lv.attributes.grade,
      finish: lv.attributes.finish,
      back: line.back, // a cushion line carries its back choice
      ground: line.ground, // an edge-to-edge line carries its base colour
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
    setGrade(saved?.grade ?? def.attributes.grade ?? null);
    setFinish(saved?.finish ?? def.attributes.finish ?? null);
    setBack(saved?.back ?? CUSHION_BACK_WHITE);
    setGround(saved?.ground ?? PATTERN_GROUND_WHITE);
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
    useSelection.getState().setSelection(product.key, { size: size ?? undefined, colour: colour ?? undefined, orientation, grade: grade ?? undefined, finish: finish ?? undefined, back, ground, message: cardMessage ?? undefined, cardImageSpan: cardSpan });
  }, [product, size, colour, orientation, grade, finish, back, ground, cardMessage, cardSpan]);

  // Phone cases: some phones only come in one grade (Pixels are tough-only) — keep the chosen
  // grade one Prodigi actually makes for the chosen phone.
  const gradesForModel = useMemo(() => (product && product.grades.length > 0 ? gradesFor(size).filter((g) => product.grades.includes(g)) : []), [product, size]);
  useEffect(() => {
    if (gradesForModel.length > 0 && (!grade || !gradesForModel.includes(grade as never))) setGrade(gradesForModel[0]!);
  }, [gradesForModel, grade]);

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
          (product.grades.length === 0 || v.attributes.grade === grade) &&
          (product.finishes.length === 0 || v.attributes.finish === finish) &&
          (v.attributes.sides ?? undefined) === wantSides,
      ) ?? null
    );
  }, [product, size, colour, orientation, grade, finish, back]);

  // The pixel size of the image this line will print from (the cutout if chosen) — fed to the
  // SAME assessment (assessPrintResolution) the server's order-time gate runs, so the badge can't disagree with it.
  const printSrc = upload?.cutout?.url ?? upload?.dataUrl ?? null;
  const [srcSize, setSrcSize] = useState<{ width: number; height: number } | null>(null);
  const [saving, setSaving] = useState(false); // "+ Keepsake" in flight (declared before any early return)
  useEffect(() => {
    if (!printSrc) return setSrcSize(null);
    const img = new window.Image();
    img.onload = () => setSrcSize(img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null);
    img.src = printSrc;
  }, [printSrc]);

  if (products && !product) {
    return (
      <Shell>
        <div className="pop-in mx-auto mt-10 max-w-sm rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-7 text-center text-sm text-ink-soft">
          That product isn’t available. <Link href="/start-creating" className="font-bold text-cinnamon underline">back to the range</Link>.
        </div>
      </Shell>
    );
  }
  if (!product) {
    return (
      <Shell>
        <div role="status" aria-label="loading" className="grid animate-pulse gap-7 md:grid-cols-2">
          <div className="polaroid tape mt-3" style={{ ['--tilt' as string]: '-1deg', ['--tape' as string]: 'color-mix(in srgb, var(--color-line) 75%, transparent)' }}>
            <div className="aspect-square w-full bg-paper-2" />
          </div>
          <div className="space-y-3 pt-3">
            <div className="h-9 w-2/3 rounded-full bg-paper-2" />
            <div className="h-4 w-full rounded-full bg-paper-2" />
            <div className="h-10 w-28 rounded-[12px] bg-paper-2" />
            <div className="flex gap-2 pt-3">
              <div className="h-11 w-20 rounded-pill bg-paper-2" />
              <div className="h-11 w-20 rounded-pill bg-paper-2" />
              <div className="h-11 w-20 rounded-pill bg-paper-2" />
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const previewImg = upload?.cutout?.url ?? upload?.dataUrl ?? null;
  const isPattern = isPatternProduct(product.key);
  // an EDGE-TO-EDGE product (a repeat, a phone case, a cushion…) can sit on any base colour
  const isGround = isGroundProduct(product.key);
  const groundNoun = product.key === 'card' && cardSpan === 'full' ? 'outside of the card' : GROUND_NOUN[product.key] ?? 'background';
  const groundWord = colourName(ground);
  const groundTitle = isPattern ? `${groundNoun} colour` : 'background colour';
  // The asset this screen acts on: in edit mode the basket line's own asset wins (so a line
  // placed under an earlier drawing edits the right image); otherwise the current upload.
  const activeAssetId = edit?.assetId ?? upload?.assetId ?? null;
  // The design to show: the line's own, unless the Studio has since saved a newer one of the SAME
  // drawing (the upload's) — then that's what the parent just made, so it wins.
  const studioNewer = edit && upload?.assetId && upload.assetId === edit.assetId ? upload.cutout?.sourceObjectId : undefined;
  const activeSource = studioNewer ?? edit?.sourceObjectId ?? upload?.cutout?.sourceObjectId;
  const savedPlacement = activeAssetId ? placements[`${activeAssetId}-${product.key}`] : undefined;
  // a phone case starts with the whole drawing clear of THIS phone's camera; everything else
  // keeps its product default. A placement the parent set themselves always wins.
  const placement =
    savedPlacement || defaultTransformFor(product.key, srcSize ? srcSize.width / srcSize.height : upload?.aspect);

  // Print-readiness (Studio spec §15 / docs/04: never silently under-resolve).
  const assessFor = (v: (typeof product.variants)[number] | null | undefined): ResolutionAssessment | null =>
    v?.printGeom && srcSize ? assessPrintResolution(v.printGeom, srcSize, clampTransform(placement), product.key) : null;
  const quality = assessFor(variant);
  const blocked = quality?.decision === 'BLOCK';
  // One-tap fixes: the LARGEST size (same colour + orientation) that passes a test.
  const largestSize = (ok: (a: ResolutionAssessment) => boolean) =>
    [...product.sizes].reverse().find((sz) => {
      const v = product.variants.find(
        (x) =>
          x.attributes.size === sz &&
          (product.colours.length === 0 || x.attributes.colour === colour) &&
          (product.orientations.length === 0 || (x.attributes.orientation ?? 'portrait') === orientation),
      );
      const a = assessFor(v);
      return a !== null && ok(a);
    }) ?? null;
  // blocked → the biggest that prints at all; soft up close → the biggest that's sharp too
  const fitSize = blocked ? largestSize((a) => a.decision !== 'BLOCK') : null;
  const sharpSize = quality?.softUpClose && !blocked ? largestSize((a) => !a.softUpClose) : null;

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
    // the editor opens where the preview shows it (a phone case's camera-clear default included)
    if (activeAssetId && !savedPlacement) usePlacements.getState().setPlacement(`${activeAssetId}-${product.key}`, placement);
    // …and on the design being placed (a Studio save / lifted cutout), not the original
    const src = activeSource ? `&source=${encodeURIComponent(activeSource)}` : '';
    router.push(`/studio/position?draft=${activeAssetId}&variant=${variant.id}${src}&return=${encodeURIComponent(ret)}`);
  };

  // "+ Keepsake": save THIS design (drawing + exact variant + placement) for later — into the
  // Keepsake Home, ready to add to a gift request. Signed-in only (like checkout).
  const saveForLater = async () => {
    if (!activeAssetId || !variant || saving) return;
    setSaving(true);
    try {
      const res = await saveDesignAction({
        assetId: activeAssetId,
        variantSku: variant.sku,
        transform: placement,
        sourceObjectId: activeSource,
        back: supportsBack ? back : undefined,
        ground: isGround ? ground : undefined,
      });
      if (res.needsAuth) {
        toast('a quick sign-up keeps your keepsakes safe');
        router.push(`/login?next=${encodeURIComponent(`/customize/${product.key}`)}`);
        return;
      }
      toast(res.ok ? 'saved to your keepsakes ♥' : 'couldn’t save that one — try again');
    } finally {
      setSaving(false);
    }
  };

  // One tap: lift the drawing off its paper (the self-hosted remove-background magic edit) so it
  // floats on the base colour instead of repeating as paper squares. Enclosed paper (the whites of
  // eyes) stays white. Only ever runs when the parent taps it.
  const liftOffPaper = async () => {
    if (!activeAssetId || lifting) return;
    setLifting(true);
    try {
      const res = await removeBackgroundAction({ assetId: activeAssetId, keepEnclosedPaper: true });
      if (res.ok) {
        useUpload.getState().setCutout({ url: res.url, sourceObjectId: res.sourceObjectId });
        if (edit) setEdit({ ...edit, sourceObjectId: res.sourceObjectId });
        toast('lifted off the paper ✨');
      } else if (res.reason === 'budget') {
        toast('that’s all your magic edits for now');
      } else if (res.reason === 'too-many') {
        toast(TOO_MANY_COPY);
      } else if (res.reason === 'nochange') {
        toast('we couldn’t find the paper edge on this one — try the studio');
      } else {
        toast('couldn’t do that — try again');
      }
    } finally {
      setLifting(false);
    }
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
      product.key === 'card' && cardMessage && (cardMessage.greeting?.trim() || cardMessage.message?.trim() || cardMessage.signature?.trim() || cardMessage.note?.trim())
        ? { greeting: cardMessage.greeting.trim(), message: cardMessage.message.trim(), signature: cardMessage.signature.trim(), note: (cardMessage.note ?? '').trim(), font: cardMessage.font, fontScale: cardMessage.fontScale ?? 1 }
        : undefined;
    const cardSpanLabel = product.key === 'card' && cardSpan === 'full' ? 'full-width' : null;
    const groundLabel = isGround && isColouredGround(ground) ? (isPattern ? `${groundWord} ${groundNoun}` : `on ${groundWord}`) : null;
    const sub = [variant.attributes.size, variant.attributes.colour, variant.attributes.orientation === 'landscape' ? 'landscape' : null, backLabel, groundLabel, cardSpanLabel, cardMsg ? 'with a message' : null].filter(Boolean).join(' · ') || undefined;
    const fields = {
      name: product.label,
      product: product.key as ProductKey,
      sku: variant.sku,
      variantId: variant.id,
      pricePence: variant.pricePence,
      sub,
      artwork: { assetId: activeAssetId, transform: placement, sourceObjectId: activeSource },
      back: supportsBack ? back : undefined, // cushion back choice (the DUAL squares only)
      ground: isGround ? ground : undefined, // base colour (edge-to-edge products)
      message: cardMsg, // card inside message (card only)
      cardImageSpan: product.key === 'card' ? cardSpan : undefined, // outside image span (card only)
    };
    if (edit) {
      // Update this exact line in place; if the variant changed, re-key to the new
      // variant's line id (merging if that line already exists) — the store handles it.
      update(edit.id, fields, basketLineId(variant.sku, fields));
      toast('basket updated ✓');
    } else {
      add({ id: basketLineId(variant.sku, fields), ...fields }); // a different drawing / colour / back = its own line
      toast('added to basket ✓');
    }
    router.push('/start-creating');
  };

  // MUG: two pictures of the REAL mug photo — the printed FRONT and the reverse BACK — with the
  // child's art wrapped onto the ceramic (compositor CYLINDER tier). No 3D, no spin.
  const isMug = product.key === 'mug';

  // The mockup view + span currently on screen — shared by the big preview AND the zoom modal so
  // zooming shows what you're looking at (not always the single view). For a card: 'outside' → the
  // flat spread ('outside-front'/'outside-full'); 'single'/'inside' → the primary card mockup. A
  // full-width closed card shows only its FRONT panel of the double-wide design (spanHalf='front').
  const activeMockupView =
    product.key === 'card'
      ? cardView === 'outside'
        ? `outside-${cardSpan}`
        : undefined
      : isMug
        ? mugSide // 'centre' | 'front' | 'back'
        : mockupView === 'tin'
          ? 'tin'
          : undefined;
  // The base colour as a preview shows it: every view of the printed product — except the jigsaw's
  // keepsake tin, a display of the lid that never takes the colour.
  const groundFor = (view?: string | null) => (isGround && view !== 'tin' ? ground : undefined);
  const activeSpanHalf: 'front' | undefined =
    product.key === 'card' && cardView !== 'outside' && cardSpan === 'full' ? 'front' : undefined;

  return (
    <Shell>
      {/* Big close-up: near-fullscreen on mobile, large on desktop. */}
      <Modal open={zoomOpen} onClose={() => setZoomOpen(false)} size="xl" fill title={product.label} subtitle={gbp(variant?.pricePence ?? product.fromPence)}>
        <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-oat p-3">
          <MockupPreview
            productKey={product.key as ProductKey}
            assetId={activeAssetId}
            variantId={variant?.id ?? null}
            transform={placement}
            size="zoom"
            sourceObjectId={activeSource ?? null}
            view={activeMockupView}
            spanHalf={activeSpanHalf}
            fill={showBack ? backFill : undefined}
            ground={groundFor(activeMockupView)}
            px={720}
            loader
          />
        </div>
      </Modal>
      <div className="grid gap-7 md:grid-cols-2 md:items-start">
        {/* Left: ONE photo preview (+20% vs the old view) with the colour strip under it */}
        <div>
          {canSpin && !isMug ? (
            <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="preview view">
              {(['photo', 'spin'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setView(m)}
                  aria-pressed={view === m}
                  className={`${OPT_SM} ${view === m ? OPT_ON : OPT_OFF}`}
                >
                  {m === 'photo' ? 'photo' : 'spin it around'}
                </button>
              ))}
            </div>
          ) : null}
          {/* Opened without a drawing (a shared link, a new tab, or one too big to keep for the tab):
              say so, and the way back, instead of a preview that pulses forever and dead buttons. */}
          {uploadReady && !activeAssetId && !upload ? (
            <div role="status" className="mt-3 rounded-[20px] border-2 border-cocoa bg-honey-band p-5 text-center shadow-[0_3px_0_var(--color-cocoa)]">
              <p className="font-display text-xl text-cocoa">Your drawing isn’t loaded</p>
              <p className="mt-1 text-[14px] text-ink-soft">Pop back and choose it again — it only takes a moment. Anything already in your basket is safe.</p>
              <Link href="/start-creating" className="press mt-4 inline-flex min-h-11 items-center justify-center rounded-pill border-2 border-cocoa bg-cta px-5 text-sm font-extrabold text-white shadow-[0_2px_0_var(--color-cocoa)]">
                choose your drawing
              </Link>
            </div>
          ) : null}
          <div className="polaroid tape relative mt-3">
            <div className="flex w-full items-center justify-center bg-paper-2 p-3">
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
                  view={activeMockupView}
                  spanHalf={activeSpanHalf}
                  fill={showBack ? backFill : undefined}
                  ground={groundFor(activeMockupView)}
                  px={360}
                  loader
                />
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  aria-label={`Enlarge ${product.label} preview`}
                  className="press absolute left-4 top-4 flex items-center justify-center rounded-full border-2 border-cocoa bg-paper p-1.5 text-cocoa shadow-[0_2px_0_var(--color-cocoa)] before:absolute before:-inset-[6px] before:content-[''] hover:text-cinnamon"
                >
                  <Icon icon={IconZoomScan} size={17} />
                </button>
              </>
            )}
            </div>
          </div>
          {view === 'spin' && canSpin ? (
            <p className="mt-1.5 text-center text-[11px] text-ink-faint">drag to spin · the photo view shows the exact print</p>
          ) : null}
          {/* Mug "centre / front / back" — the real mug photographed three ways, the art wrapped
              onto the ceramic: centre (design middle, handle hidden), front (right side), back (left). */}
          {isMug ? (
            <>
              <div className="mt-2 flex items-center justify-center gap-1.5" role="group" aria-label="mug view">
                {([['the centre', 'centre'], ['the front', 'front'], ['the back', 'back']] as const).map(([label, side]) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => setMugSide(side)}
                    aria-pressed={mugSide === side}
                    className={`${OPT_SM} ${mugSide === side ? OPT_ON : OPT_OFF}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-center text-[11px] text-ink-faint">a preview of how your mug prints</p>
            </>
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
                  className={`${OPT_SM} ${showBack === b ? OPT_ON : OPT_OFF}`}
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
                    className={`${THUMB} ${cardView === v ? THUMB_ON : THUMB_OFF}`}
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
                        spanHalf={v === 'single' && cardSpan === 'full' ? 'front' : undefined}
                        ground={groundFor()}
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
                  className={`${THUMB} ${mockupView === v ? THUMB_ON : THUMB_OFF}`}
                >
                  <MockupPreview
                    productKey={product.key as ProductKey}
                    assetId={activeAssetId}
                    variantId={variant?.id ?? null}
                    transform={placement}
                    size="thumb"
                    sourceObjectId={activeSource ?? null}
                    view={v === 'tin' ? 'tin' : undefined}
                    ground={groundFor(v)}
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
                  className={`${THUMB} ${cushionShapeOf(size) === e.shape ? THUMB_ON : THUMB_OFF}`}
                >
                  <MockupPreview
                    productKey={product.key as ProductKey}
                    assetId={activeAssetId}
                    variantId={e.variantId}
                    transform={placement}
                    size="thumb"
                    sourceObjectId={activeSource ?? null}
                    ground={groundFor()}
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
                className="press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa before:absolute before:-inset-[4px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
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
                        className={`${THUMB} ${colour === c ? THUMB_ON : THUMB_OFF}`}
                      >
                        <MockupPreview
                          productKey={product.key as ProductKey}
                          assetId={activeAssetId}
                          variantId={cv.id}
                          transform={placement}
                          size="thumb"
                          sourceObjectId={activeSource ?? null}
                          ground={groundFor()}
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
                className="press relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa before:absolute before:-inset-[4px] before:content-[''] hover:text-cinnamon disabled:opacity-35"
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
          <h1 className="font-display text-[32px] leading-tight text-cocoa md:text-4xl">{product.label}</h1>
          {product.blurb ? <p className="mt-1 text-sm text-ink-soft">{product.blurb}</p> : null}
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="sticker inline-flex rotate-[-2deg] rounded-[12px] bg-honey px-3 py-1 font-display text-2xl text-cocoa">
              {gbp(variant?.pricePence ?? product.fromPence)}
            </span>
            <span className="text-xs font-semibold text-green-save">{deliveryLine(variant?.sku ?? product.key)}</span>
            <ChristmasPromise productKey={product.key} attrs={{ size, colour }} />
          </div>

          {/* Phone cases: the "size" is the phone — a type-to-search picker, then grade + finish. */}
          {product.key === 'phoneCase' ? (
            <>
              <PhoneModelPicker value={size} onChange={setSize} />
              {gradesForModel.length > 0 ? (
                <Picker label="Case" options={gradesForModel} value={grade} onChange={setGrade} describe={(g) => CASE_GRADE_BLURB[g as keyof typeof CASE_GRADE_BLURB]} />
              ) : null}
              {gradesForModel.length === 1 && product.grades.length > 1 ? (
                <p className="mt-1.5 text-xs text-ink-soft">this phone comes in {gradesForModel[0]} only.</p>
              ) : null}
              {product.finishes.length > 1 ? <Picker label="Finish" options={product.finishes} value={finish} onChange={setFinish} /> : null}
            </>
          ) : /* A single-size product needs no picker — the size lives in the product details. */
          product.sizes.length > 1 ? (
            <Picker
              // The bauble's "sizes" are its two STYLES (ceramic disc / plastic ball — D24).
              label={product.key === 'bauble' ? 'Style' : 'Size'}
              options={product.sizes}
              value={size}
              onChange={setSize}
              // Show the physical size under word-sized buttons (the blanket's medium/large); the
              // frame/jigsaw/mug sizes already state their own measure in the name.
              describe={product.key === 'blanket' ? (s) => sizeDimsCm(product, s) : product.key === 'bauble' ? (s) => BAUBLE_STYLE_BLURB[s] ?? '' : undefined}
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
          {product.colours.length > 0 ? <Picker label="Colour" options={coloursForSize} value={colour} onChange={setColour} swatch swatchFor={product.key} /> : null}

          {/* BASE COLOUR (edge-to-edge products): any colour on a wheel, filling the whole printed face
              under the drawing — a repeat sits on it, a placed drawing sits in it. Off its paper the
              drawing floats on the colour; still on its paper, a friendly one-tap nudge lifts it off. */}
          {isGround ? (
            <BaseColourPicker title={groundTitle} noun={groundNoun} pattern={isPattern} value={ground} onChange={setGround}>
              {isColouredGround(ground) && upload?.opaqueBg && !activeSource ? (
                <div role="status" className="mt-3 rounded-[16px] border-2 border-cocoa bg-honey-band p-3 text-[13px] text-cocoa shadow-[0_3px_0_var(--color-cocoa)]">
                  <p className="font-semibold">
                    {isPattern
                      ? <>the paper prints too — you’d get paper squares on the {groundWord}. lift the drawing off it and it sits right on the colour.</>
                      : <>the paper prints too — you’d get a white box on the {groundWord}. lift the drawing off it and it sits right on the colour.</>}
                  </p>
                  <Button variant="design" size="md" className="mt-2.5 w-full" onClick={() => void liftOffPaper()} disabled={lifting}>
                    <Icon icon={IconPencil} size={15} /> {lifting ? 'lifting it off…' : 'lift it off the paper'}
                  </Button>
                </div>
              ) : null}
            </BaseColourPicker>
          ) : null}

          {/* CUSHION back: pick a back colour (white is the single-sided default; any other colour
              is a double-sided upgrade) or 'image both sides'. heart + round are single-sided.
              Tapping flips the preview. */}
          {product.key === 'cushion' && supportsBack ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">The back</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {CUSHION_BACK_SWATCHES.map((c) => (
                  <button
                    key={c.token}
                    type="button"
                    onClick={() => { setBack(c.token); setShowBack(true); }}
                    aria-pressed={back === c.token}
                    aria-label={`${c.label} back`}
                    title={c.label}
                    className={`press relative h-9 w-9 rounded-full border-2 before:absolute before:-inset-[4px] before:content-[''] ${back === c.token ? 'border-cocoa ring-2 ring-cocoa ring-offset-2 ring-offset-paper' : 'border-cocoa/30'}`}
                    style={{ backgroundColor: c.hex }}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => { setBack(CUSHION_BACK_MATCH); setShowBack(true); }}
                  aria-pressed={back === CUSHION_BACK_MATCH}
                  className={`${OPT} ${back === CUSHION_BACK_MATCH ? OPT_ON : OPT_OFF}`}
                >
                  image both sides
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {back === CUSHION_BACK_WHITE
                  ? 'white back · single-sided'
                  : back === CUSHION_BACK_MATCH
                    ? 'your image, printed on both sides · double-sided'
                    : `image on the front · ${CUSHION_BACK_SWATCHES.find((c) => c.token === back)?.label ?? ''} back · double-sided`}
              </p>
            </div>
          ) : product.key === 'cushion' ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">The back</p>
              <p className="mt-1.5 text-[11px] text-ink-faint">your image on the front · soft stone back</p>
            </div>
          ) : null}

          {/* CARD outside: the drawing on the front panel only, or spanning the whole outside. A
              purchase option — picking one shows the outside view so the shopper sees the effect. */}
          {product.key === 'card' ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">The outside</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {([['front only', 'front'], ['full width', 'full']] as const).map(([label, span]) => (
                  <button
                    key={span}
                    type="button"
                    onClick={() => { setCardSpan(span); setCardView('outside'); }}
                    aria-pressed={cardSpan === span}
                    className={`${OPT} ${cardSpan === span ? OPT_ON : OPT_OFF}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-ink-faint">
                {cardSpan === 'full' ? 'the drawing spans the whole outside, across the fold' : 'the drawing on the front; the back stays plain'}
              </p>
            </div>
          ) : null}

          {/* CARD inside: leave it blank (write by hand) or add a printed message — three fields
              (greeting / message / signature) in a chosen font, auto-fit to the card inside. */}
          {product.key === 'card' ? (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">The inside</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCardMessage(null)}
                  aria-pressed={cardMessage === null}
                  className={`${OPT} ${cardMessage === null ? OPT_ON : OPT_OFF}`}
                >
                  leave it blank
                </button>
                <button
                  type="button"
                  onClick={() => { setCardMessage((m) => m ?? { greeting: '', message: '', signature: '', note: '', font: CARD_FONT_DEFAULT, fontScale: 1 }); setCardView('inside'); }}
                  aria-pressed={cardMessage !== null}
                  className={`${OPT} ${cardMessage !== null ? OPT_ON : OPT_OFF}`}
                >
                  add a message
                </button>
              </div>
              {cardMessage === null ? (
                <p className="mt-1.5 text-[11px] text-ink-faint">left blank for you to write in by hand</p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {([
                    ['Greeting', 'greeting', 'Happy Birthday!', 80, 2],
                    ['Message', 'message', 'Hope your special day is full of cake and fun…', 600, 4],
                    ['Signature', 'signature', 'love, Mabel x', 80, 2],
                    ['Note (facing page)', 'note', 'write something wonderful', 200, 2],
                  ] as const).map(([label, key, placeholder, max, rows]) => (
                    <label key={key} className="block">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">{label}</span>
                      <textarea
                        value={cardMessage[key]}
                        onChange={(e) => setCardMessage({ ...cardMessage, [key]: e.target.value.slice(0, max) })}
                        onFocus={() => setCardView('inside')}
                        placeholder={placeholder}
                        rows={rows}
                        maxLength={max}
                        className="mt-1 w-full resize-none rounded-[14px] border-2 border-cocoa/20 bg-paper px-3 py-2 text-sm text-cocoa placeholder:text-ink-faint focus:border-cocoa"
                        style={{ fontFamily: cardFontCss(cardMessage.font) }}
                      />
                    </label>
                  ))}
                  <div className="flex flex-wrap items-start gap-x-5 gap-y-2.5">
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Font</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {CARD_FONTS.map((f) => (
                          <button
                            key={f.token}
                            type="button"
                            onClick={() => setCardMessage({ ...cardMessage, font: f.token })}
                            aria-pressed={cardMessage.font === f.token}
                            className={`${OPT} !text-base !font-normal leading-none ${cardMessage.font === f.token ? OPT_ON : OPT_OFF}`}
                            style={{ fontFamily: f.css }}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Size</p>
                      <div className="mt-1.5 flex gap-1.5">
                        {([['S', 0.8], ['M', 1], ['L', 1.25]] as const).map(([lbl, scale]) => (
                          <button
                            key={lbl}
                            type="button"
                            onClick={() => setCardMessage({ ...cardMessage, fontScale: scale })}
                            aria-pressed={(cardMessage.fontScale ?? 1) === scale}
                            className={`${OPT} w-11 justify-center !px-0 ${(cardMessage.fontScale ?? 1) === scale ? OPT_ON : OPT_OFF}`}
                          >
                            {lbl}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-ink-faint">screened before print · greeting, message &amp; signature on the right page; the note on the left</p>
                </div>
              )}
            </div>
          ) : null}

          {/* collapsible, scrollable-in-container description */}
          {product.description ? (
            <div className="mt-5 rounded-[16px] border-2 border-cocoa/15 bg-paper">
              <button
                type="button"
                onClick={() => setDescOpen((o) => !o)}
                aria-expanded={descOpen}
                className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left text-sm font-extrabold text-cocoa"
              >
                product details
                <Icon icon={IconChevronDown} size={16} className={`text-ink-faint transition-transform ${descOpen ? 'rotate-180' : ''}`} />
              </button>
              {descOpen ? (
                <div className="brand-scroll max-h-44 overflow-y-auto border-t-2 border-cocoa/10 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
                  <p>{product.description}</p>
                  {Object.keys(product.specs).length > 0 ? (
                    <dl className="mt-3 space-y-1">
                      {Object.entries(product.specs).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="min-w-20 font-bold capitalize text-cocoa">{k}</dt>
                          <dd>{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {isGarmentKey(product.key) ? (
            <div className="mt-5 space-y-2">
              {isDarkGarment(colour) && upload?.opaqueBg && !upload?.cutout ? (
                <div role="status" className="rounded-[16px] border-2 border-cocoa bg-honey-band p-3 text-[13px] text-cocoa shadow-[0_3px_0_var(--color-cocoa)]">
                  <p className="font-semibold">on a coloured tee, the paper prints too — you’d get a pale square behind the drawing.</p>
                  <Button variant="design" size="md" className="mt-2.5 w-full" onClick={() => router.push('/studio')}>
                    <Icon icon={IconPencil} size={15} /> lift it off the paper in the studio
                  </Button>
                </div>
              ) : null}
              <p className="text-xs leading-relaxed text-ink-soft">
                printed straight onto organic cotton, at the size shown — colours come out a touch softer than on screen.
              </p>
            </div>
          ) : null}

          {quality ? (
            blocked ? (
              <div role="status" className="mt-5 rounded-[16px] border-2 border-cocoa bg-berry-pale p-3 text-[13px] text-cocoa shadow-[0_3px_0_var(--color-cocoa)]">
                <p className="flex items-start gap-2 font-semibold">
                  <Icon icon={IconAlertTriangle} size={16} className="mt-0.5 shrink-0 text-cinnamon" />
                  this drawing is too small to print well at {size || 'this size'} — it would come out blurry.
                </p>
                {fitSize ? (
                  <Button variant="secondary" size="md" className="mt-2.5 w-full" onClick={() => setSize(fitSize)}>
                    make it {fitSize} — prints beautifully
                  </Button>
                ) : (
                  <p className="mt-1.5 text-xs text-ink-soft">try a smaller product, or a bigger photo of the drawing.</p>
                )}
              </div>
            ) : (
              <div role="status" className="mt-5 text-[13px]">
                <p className="flex items-center gap-1.5 font-semibold text-green-save">
                  <Icon icon={IconCircleCheck} size={16} />
                  {quality.decision === 'OK'
                    ? 'print-ready at this size'
                    : !quality.softUpClose
                      ? 'print-ready — we’ll gently sharpen it up for print'
                      : 'it’ll print — lovely from a step back, a little soft up close'}
                </p>
                {quality.softUpClose ? (
                  <p className="mt-1 pl-[22px] text-xs text-ink-soft">
                    {sharpSize && sharpSize !== size ? (
                      <>
                        crisp right up close at{' '}
                        <button type="button" onClick={() => setSize(sharpSize)} className="font-bold text-cinnamon underline-offset-2 hover:underline">
                          {sharpSize}
                        </button>{' '}
                        — or use the original photo, not one sent by message.
                      </>
                    ) : (
                      'for crisp up close, use the original photo — not one sent by message.'
                    )}
                  </p>
                ) : null}
              </div>
            )
          ) : null}

          {/* Primary actions: a thumb-zone dock on phones (kraft, like the landing's), inline from md. */}
          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 flex gap-2.5 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:justify-end md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none">
            {product.key !== 'card' && !edit ? (
              <Button variant="secondary" size="lg" className="shrink-0 !px-4 md:!px-8" onClick={saveForLater} disabled={!variant || !activeAssetId || saving}>
                <Icon icon={IconHeartPlus} size={17} /> {saving ? 'saving…' : '+ keepsake'}
              </Button>
            ) : null}
            <Button size="lg" className="min-w-0 flex-1 whitespace-nowrap !px-3 !text-[15px] md:flex-none md:!px-8 md:!text-base" onClick={addToBasket} disabled={!variant || blocked}>
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
/**
 * The card INSIDE, as an open 2-page spread (10:7 landscape). Left = the facing page: the `note`
 * centred both ways. Right = greeting (top, left-justified), message (centred), signature (bottom).
 * Positions mirror the four print quads; `fontScale` (S/M/L) multiplies every line together.
 * Display only — the flat 4-panel print file renders the same text server-side (#133).
 */
function CardInsidePreview({ message, compact = false }: { message: CardMessage | null; compact?: boolean }) {
  const greeting = message?.greeting?.trim() ?? '';
  const msg = message?.message?.trim() ?? '';
  const signature = message?.signature?.trim() ?? '';
  const note = message?.note?.trim() ?? '';
  const empty = !greeting && !msg && !signature && !note;
  const scale = message?.fontScale ?? 1;
  // ONE base size for every field, then shrink-to-fit — the SAME model the print renderer uses
  // (cardText.ts), so the S/M/L control is consistent across every panel and a long verse fits
  // instead of clipping, and what the shopper sees is what prints. Sizes are cqw (% of the spread's
  // width): each page is 50cqw wide, the 10:7 spread 70cqw tall, with p-[5cqw] padding ⇒ a padded
  // page box of 40×60 cqw. base = BODY(0.085)×50 cqw × S/M/L; keep BODY in sync with cardText.ts.
  const base = 0.085 * 50 * scale;
  const leftCqw = fitCardFontSize([note], 40, 60, base, { lineHeight: 1.3 });
  const rightCqw = fitCardFontSize([greeting, msg, signature], 40, 60, base, { lineHeight: 1.3, gapLines: 1 });
  const cqw = (v: number) => ({ fontSize: `${v}cqw`, lineHeight: 1.3 });
  return (
    <div className={`flex w-full items-center justify-center ${compact ? 'h-full' : ''}`}>
      {/* Width-driven so a landscape spread never overflows a narrow column; height comes from the
          10:7 aspect. Capped on desktop; fills (and vertically centres in) the square thumbnail. A
          container context lets the inside text scale with the spread (cqw). */}
      <div
        className={`relative flex aspect-[10/7] w-full max-h-full overflow-hidden rounded-lg border border-line bg-white text-cocoa [container-type:inline-size] ${compact ? '' : 'mx-auto max-w-[460px] shadow-[0_2px_10px_color-mix(in_srgb,var(--color-cocoa)_8%,transparent)]'}`}
        style={{ fontFamily: cardFontCss(message?.font) }}
      >
        {/* centre fold */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line" />
        {empty ? (
          <div className="m-auto px-4 text-center text-[3.4cqw] text-ink-faint" style={{ fontFamily: 'var(--font-sans)' }}>
            your message will appear here
          </div>
        ) : (
          <>
            {/* facing (left) page: the note, centred both ways — one fitted size. `min-w-0` +
                overflow-wrap:anywhere so a long UNBROKEN string (no spaces) wraps inside the page
                instead of sprawling across the spread (flexbox min-width:auto otherwise grows the
                item to the unbreakable word). */}
            <div className="flex w-1/2 min-w-0 items-center justify-center p-[5cqw]">
              {note ? (
                <p className="w-full min-w-0 whitespace-pre-wrap text-center [overflow-wrap:anywhere]" style={cqw(leftCqw)}>{note}</p>
              ) : null}
            </div>
            {/* inside-right page: greeting top-left · message centred · signature bottom-left — the
                three share ONE fitted size (rightCqw) so the page reads evenly. */}
            <div className="flex w-1/2 min-w-0 flex-col p-[5cqw]">
              {greeting ? (
                <p className="w-full min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]" style={cqw(rightCqw)}>{greeting}</p>
              ) : null}
              <div className="flex min-w-0 flex-1 items-center justify-center py-[2cqw]">
                {msg ? (
                  <p className="w-full min-w-0 whitespace-pre-wrap text-center [overflow-wrap:anywhere]" style={cqw(rightCqw)}>{msg}</p>
                ) : null}
              </div>
              {signature ? (
                <p className="w-full min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]" style={cqw(rightCqw)}>{signature}</p>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Scrapbook option chips (D12): ≥44px stickers — ink outline; the chosen one fills with ink.
const OPT = 'press inline-flex min-h-11 items-center rounded-pill border-2 px-3.5 text-xs font-bold';
// Compact view toggles under the preview: visually 36px, the ::before extends the tap area to 44px.
const OPT_SM = "press relative inline-flex min-h-9 items-center rounded-pill border-2 px-3.5 text-xs font-bold before:absolute before:-inset-[4px] before:content-['']";
const OPT_ON = 'border-cocoa bg-cocoa text-paper shadow-[0_2px_0_var(--color-cocoa)]';
const OPT_OFF = 'border-cocoa/25 bg-paper text-ink-soft hover:border-cocoa';
// Preview thumbnails (views, shapes, colours): little polaroid squares; the chosen one is inked.
const THUMB = 'press aspect-square w-[calc((100%-1rem)/3)] shrink-0 overflow-hidden rounded-[14px] border-2 bg-paper-2 p-1';
const THUMB_ON = 'border-cocoa shadow-[0_3px_0_var(--color-cocoa)]';
const THUMB_OFF = 'border-cocoa/15 hover:border-cocoa/50';

function Picker({
  label,
  options,
  value,
  onChange,
  swatch = false,
  swatchFor,
  describe,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  swatch?: boolean;
  /** Product key so swatches resolve product-specific colours (the mug's real two-tone hexes). */
  swatchFor?: string;
  /** Optional small sub-label under an option (e.g. a size's dimensions). */
  describe?: (o: string) => string | undefined;
}) {
  return (
    <div className="mt-5">
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => {
          const sub = describe?.(o);
          return (
            <button
              key={o}
              type="button"
              onClick={() => onChange(o)}
              aria-pressed={value === o}
              className={`${OPT} gap-1.5 ${value === o ? OPT_ON : OPT_OFF}`}
            >
              {swatch ? <span className="h-4 w-4 rounded-full border-2 border-paper outline outline-1 outline-cocoa/30" style={{ backgroundColor: swatchColour(o, swatchFor) }} /> : null}
              {sub ? (
                <span className="flex flex-col items-start leading-tight">
                  <span>{o}</span>
                  <span className={`text-[10px] font-semibold ${value === o ? 'text-paper' : 'text-ink-soft'}`}>{sub}</span>
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

/** The bauble's two styles, in a line each (D24). */
const BAUBLE_STYLE_BLURB: Record<string, string> = {
  'ceramic disc': 'flat & glossy, 7.5 cm · tracked post',
  'plastic ball': 'printed all the way round, won’t break · 8 cm',
};

function swatchColour(name: string, productKey?: string): string {
  if (productKey === 'mug' && MUG_SWATCH[name]) return MUG_SWATCH[name];
  if (isGarmentKey(productKey)) return garmentHex(name) ?? 'var(--color-line)';
  const map: Record<string, string> = {
    oak: '#C8A06A', black: '#2E2723', white: '#F7F2E8', sky: '#84BBD0', pink: '#E8A6B8',
    natural: '#E7D9BE', gold: '#D9B45B', blue: '#5B8AC0', 'caribbean blue': '#3FA9C9', 'cotton pink': '#E8A6B8',
    brown: '#6B4A32', 'dark grey': '#4D4C4A', 'light grey': '#CFCDC8', silver: '#B9B6AE',
    kraft: '#B98B5E', // brown kraft wrapping paper (D24)
  };
  return map[name] ?? 'var(--color-line)';
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/start-creating', label: 'Back to your range' }} />
      {/* pb-36 on phones clears the fixed thumb-zone action dock. */}
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-36 pt-6 md:px-6 md:pb-10">{children}</main>
    </div>
  );
}
