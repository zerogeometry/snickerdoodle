'use client';

import { IconAlertTriangle, IconCircleCheck, IconPlus, IconRepeat, IconShoppingBag, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { FlowHeader } from './FlowHeader';
import { ChristmasPromise } from './ChristmasPromise';
import { ProductDetails } from './ProductDetails';
import { PickerBody, type Drawing, type PickerState } from './CardPackBuilder';
import { forgetResumeVisit, isResumeVisit, usePickerEdits } from './usePickerEdits';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { keepsakePickerAction } from '@/app/actions/keepsakePicker';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';
import { clampTransform, type ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import {
  FRAME_GRIDS, FRAME_MOULDING_HEX, FRAME_SIZES, MAX_FRAME_SLOTS, MULTI_FRAME_COLOURS, MULTI_PHOTO_FRAME_KEY,
  fillFrameSlots, frameGridOf, frameSlotRects, slotBleedPx, type FrameGrid, type FrameSize,
} from '@/lib/multi-photo-frame';
import { frameGridLine, newFrameLineId } from '@/lib/multi-photo-frame-line';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { deliveryLine } from '@/lib/delivery';
import { gbp, shownSrc, toast, useBasket, useUpload, type PackCardLine } from '@/lib/store';
import { useStoredUpload } from '@/lib/useStoredUpload';

/**
 * The MULTI PHOTO FRAME builder (5 Nov 2026 — src/lib/multi-photo-frame.ts): choose a size (9, 16,
 * 24 or 40 drawings — the two big ones hang landscape or portrait) and a frame colour → put a drawing
 * in every square, exactly the
 * way a card pack is filled (the same keepsake-box picker and its workshop: upload to the keepsake
 * box, remove background, edit in studio) → any square left empty repeats the MAIN drawing (square
 * 1's), so one drawing makes a whole frame → add ONE basket line.
 *
 * Not in /mockups — extends the Scrapbook language of the card-pack + calendar builders (taped
 * polaroids, ink chips, the kraft thumb-zone dock, the bottom-sheet picker). The frame preview is
 * drawn at the print's own geometry (frameSlotRects — the squares where Prodigi's template puts
 * them). The price shown is the catalogue's; the server re-prices the frame and re-checks every
 * square (authz, moderation, DPI) at order time.
 */

type Slot = PackCardLine | null;

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];
const PICKER_TTL_MS = 8 * 60_000; // signed URLs live 10 min — refresh the list before they lapse
const PLACE: PackCardLine['transform'] = defaultTransformFor(MULTI_PHOTO_FRAME_KEY); // each drawing fills its square
const DRAFT_KEY = 'sd_frame_draft'; // per tab: picks survive a trip to the Studio
const NEXT = '/customize/multiPhotoFrame';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

type Draft = { size: string | null; orientation: string | null; colour: string | null; slots: Slot[] };
function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    const d = raw ? (JSON.parse(raw) as { size?: unknown; orientation?: unknown; colour?: unknown; slots?: unknown }) : null;
    if (!d || !Array.isArray(d.slots)) return null;
    const slots = d.slots.slice(0, MAX_FRAME_SLOTS).map((s) => (s && typeof s === 'object' && typeof (s as PackCardLine).assetId === 'string' ? (s as PackCardLine) : null));
    const str = (v: unknown) => (typeof v === 'string' ? v : null);
    return { size: str(d.size), orientation: str(d.orientation), colour: str(d.colour), slots };
  } catch {
    return null;
  }
}
function writeDraft(d: Draft | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage unavailable — the draft just doesn't survive a reload
  }
}

export function MultiPhotoFrameBuilder() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  useStoredUpload(); // a direct load: the guest's drawing is stored, so the picker offers it (01-B4)
  const add = useBasket((s) => s.add);
  const update = useBasket((s) => s.update);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  const [size, setSize] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<string | null>(null);
  const [colour, setColour] = useState<string | null>(null);
  // kept as long as the biggest frame, so 16 → 9 → 16 doesn't lose squares 10–16
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: MAX_FRAME_SLOTS }, () => null));
  const [edit, setEdit] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ status: 'loading' });
  // Which square the sheet is filling (null = closed), and whether it steps on to the next empty
  // square after placing one (true when it was opened to FILL, false when swapping one).
  const [sheet, setSheet] = useState<{ slot: number; advance: boolean } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [dims, setDims] = useState<Record<string, { width: number; height: number } | null>>({});

  // ── load: the catalogue and the keepsake box ──────────────────────────────────────────────
  const loadCatalogue = useCallback(() => {
    setCatalogueFailed(false);
    // HIDDEN until the founder's frame photos are in: the curation view, which only a dev server
    // honours (production refuses includeHidden, so there the frame stays unavailable).
    loadCatalogueAction({ includeHidden: true })
      .then(setProducts)
      .catch(() => setCatalogueFailed(true));
  }, []);
  useEffect(loadCatalogue, [loadCatalogue]);

  const loadPicker = useCallback(() => {
    setPicker({ status: 'loading' });
    keepsakePickerAction()
      .then((r) => setPicker(r.ok ? { status: 'ready', signedIn: r.signedIn, keepsakes: r.keepsakes, at: Date.now() } : { status: 'error' }))
      .catch(() => setPicker({ status: 'error' }));
  }, []);
  useEffect(loadPicker, [loadPicker]);

  const product = products?.find((p) => p.key === MULTI_PHOTO_FRAME_KEY) ?? null;
  const variants = useMemo(() => product?.variants ?? [], [product]);
  const fallback = variants.find((v) => v.isDefault) ?? variants[0] ?? null;
  const sizes = useMemo(() => FRAME_SIZES.filter((sz) => variants.some((v) => v.attributes.size === sz)), [variants]);
  const sizeNow = size && (sizes as readonly string[]).includes(size) ? size : (fallback?.attributes.size ?? null);
  // the two big sizes hang either way — landscape (Prodigi's own template) unless chosen otherwise
  const orientations = FRAME_GRIDS.filter((g) => g.size === sizeNow && g.orientation !== 'square').map((g) => g.orientation);
  const orientationNow = orientations.length ? (orientation && (orientations as string[]).includes(orientation) ? orientation : orientations[0]!) : null;
  const ofSize = (v: CatalogueVariant) => v.attributes.size === sizeNow && (v.attributes.orientation ?? null) === orientationNow;
  const coloursNow = MULTI_FRAME_COLOURS.filter((c) => variants.some((v) => ofSize(v) && v.attributes.colour === c));
  const colourNow = colour && (coloursNow as readonly string[]).includes(colour) ? colour : (fallback?.attributes.colour ?? coloursNow[0] ?? null);
  const variant: CatalogueVariant | null = variants.find((v) => ofSize(v) && v.attributes.colour === colourNow) ?? fallback;
  const grid = frameGridOf(variant?.attributes.size, variant?.attributes.orientation);
  const count = grid ? grid.cols * grid.rows : 0;
  const compact = count > 16; // the big frames: a compact grid of squares
  const mine = useMemo(() => slots.slice(0, count), [slots, count]);
  const filledCount = mine.filter(Boolean).length;

  // Seed once the product is known: a basket line (?edit=<lineId>) reopens exactly that frame;
  // otherwise this tab's draft (only on the way back from the Studio); otherwise the drawing in
  // progress goes in square 1 — so the very first view is already a whole frame of it.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!product || seededRef.current) return;
    seededRef.current = true;
    const id = new URLSearchParams(window.location.search).get('edit');
    const line = id ? useBasket.getState().items.find((i) => i.id === id && i.slots?.length) : null;
    if (line) {
      setEdit(line.id);
      const v = product.variants.find((x) => x.id === line.variantId);
      if (v) {
        setSize(v.attributes.size ?? null);
        setOrientation(v.attributes.orientation ?? null);
        setColour(v.attributes.colour ?? null);
      }
      setSlots(Array.from({ length: MAX_FRAME_SLOTS }, (_, i) => (line.slots![i] ? { ...line.slots![i]! } : null)));
      return;
    }
    const resuming = isResumeVisit();
    forgetResumeVisit();
    if (!resuming) writeDraft(null);
    const draft = resuming ? readDraft() : null;
    if (draft?.slots.some(Boolean)) {
      setSize(draft.size);
      setOrientation(draft.orientation);
      setColour(draft.colour);
      setSlots(Array.from({ length: MAX_FRAME_SLOTS }, (_, i) => draft.slots[i] ?? null));
      return;
    }
    const u = useUpload.getState().upload;
    if (u?.assetId) setSlots((s) => [{ assetId: u.assetId!, transform: PLACE, ...(u.cutout?.sourceObjectId ? { sourceObjectId: u.cutout.sourceObjectId } : {}) }, ...s.slice(1)]);
  }, [product]);

  // A drawing stored only now (a direct load — 01-B4) goes in square 1, if no square is filled yet.
  useEffect(() => {
    if (!seededRef.current || edit || !upload?.assetId) return;
    const a = upload.assetId;
    setSlots((old) => (old.some(Boolean) ? old : [{ assetId: a, transform: PLACE }, ...old.slice(1)]));
  }, [upload?.assetId, edit]);

  // Keep this tab's draft (not while editing a basket line — that line IS the saved state).
  useEffect(() => {
    if (!seededRef.current || edit) return;
    writeDraft(slots.some(Boolean) ? { size: sizeNow, orientation: orientationNow, colour: colourNow, slots } : null);
  }, [slots, sizeNow, orientationNow, colourNow, edit]);

  // Every drawing on offer: the one in progress first, then the keepsake box. One entry per drawing.
  const drawingsRaw = useMemo(() => {
    const list: Drawing[] = [];
    if (upload?.assetId) {
      list.push({ assetId: upload.assetId, imageUrl: shownSrc(upload) ?? upload.dataUrl, sourceObjectId: upload.cutout?.sourceObjectId, label: 'this drawing', printable: true });
    }
    if (picker.status === 'ready') {
      for (const k of picker.keepsakes) {
        if (list.some((d) => d.assetId === k.id)) continue;
        const when = shortDate(k.createdAtISO);
        list.push({ assetId: k.id, imageUrl: k.imageUrl, thumbUrl: k.thumbUrl ?? null, ...(k.sourceObjectId ? { sourceObjectId: k.sourceObjectId } : {}), label: k.childFirstName ? `${k.childFirstName} · ${when}` : `kept ${when}`, printable: true }); // the ORDER holds anything screening hasn't cleared (orders.ts, D8)
      }
    }
    return list;
  }, [upload, picker]);
  const tools = usePickerEdits({ returnTo: `${NEXT}?resume=1`, onUploaded: loadPicker, sheet, onCopied: setChosen });
  // back from the Studio: the picker open again on the square it was filling, the edited drawing chosen
  const { resume, clearResume } = tools;
  useEffect(() => {
    if (!resume || !product) return;
    clearResume();
    setSheet(resume.sheet);
    setChosen(resume.assetId);
  }, [resume, clearResume, product]);
  const applyEdits = tools.apply;
  const drawings = useMemo(() => applyEdits(drawingsRaw), [applyEdits, drawingsRaw]);
  // a drawing edited here (remove background, the Studio) → every square already showing it shows the edit
  useEffect(() => {
    setSlots((old) => {
      let changed = false;
      const next = old.map((c) => {
        if (!c) return c;
        const sid = drawings.find((d) => d.assetId === c.assetId)?.sourceObjectId;
        if (sid === c.sourceObjectId) return c;
        changed = true;
        const { sourceObjectId: _was, ...rest } = c;
        return sid ? { ...rest, sourceObjectId: sid } : rest;
      });
      return changed ? next : old;
    });
  }, [drawings]);
  const drawingFor = useCallback((assetId: string) => drawings.find((d) => d.assetId === assetId) ?? null, [drawings]);

  // What prints: every square, the gaps repeating the main drawing (the server does the same).
  const squares: Slot[] = useMemo(() => (filledCount > 0 ? fillFrameSlots(mine, count) : mine), [mine, count, filledCount]);

  // The pixel size of each drawing — fed to the SAME assessment the order-time gate runs, per square.
  useEffect(() => {
    const started = new Set<string>();
    for (const c of squares) {
      if (!c) continue;
      const d = drawings.find((x) => x.assetId === c.assetId);
      const key = `${c.assetId}:${c.sourceObjectId ?? ''}`;
      if (!d?.imageUrl || key in dims || started.has(key)) continue;
      started.add(key);
      if (d.px) {
        const px = d.px;
        setDims((m) => ({ ...m, [key]: { width: px.width, height: px.height } }));
        continue;
      }
      setDims((m) => ({ ...m, [key]: null }));
      const img = new window.Image();
      img.onload = () => setDims((m) => ({ ...m, [key]: img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null }));
      img.src = d.imageUrl;
    }
  }, [squares, drawings, dims]);

  const printGeom = variant?.printGeom ?? null;
  const assess = (c: PackCardLine): ResolutionAssessment | null => {
    const src = dims[`${c.assetId}:${c.sourceObjectId ?? ''}`];
    return printGeom && src ? assessPrintResolution(printGeom, src, clampTransform(c.transform), MULTI_PHOTO_FRAME_KEY) : null;
  };
  const blockedAt = squares.findIndex((c) => c && assess(c)?.decision === 'BLOCK');

  // ── picking ────────────────────────────────────────────────────────────────────────────────
  const openSheet = (slot: number, advance: boolean) => {
    if (picker.status === 'ready' && Date.now() - picker.at > PICKER_TTL_MS) loadPicker();
    setChosen(mine[slot]?.assetId ?? null);
    setAnnounce('');
    setSheet({ slot, advance });
  };
  const firstEmpty = (list: Slot[], from = 0) => {
    for (let i = 0; i < count; i++) {
      const j = (from + i) % count;
      if (!list[j]) return j;
    }
    return -1;
  };
  const pickFor = (d: Drawing): PackCardLine => ({ assetId: d.assetId, transform: PLACE, ...(d.sourceObjectId ? { sourceObjectId: d.sourceObjectId } : {}) });

  const putInSquare = () => {
    if (!sheet || !chosen) return;
    const d = drawingFor(chosen);
    if (!d) return;
    const next = [...mine];
    next[sheet.slot] = pickFor(d);
    setSlots((old) => [...next, ...old.slice(count)]);
    const nextEmpty = sheet.advance ? firstEmpty(next, sheet.slot + 1) : -1;
    if (nextEmpty >= 0 && nextEmpty > sheet.slot) {
      setSheet({ slot: nextEmpty, advance: true });
      setChosen(null);
      setAnnounce(`square ${sheet.slot + 1} done — now square ${nextEmpty + 1}`);
    } else {
      setSheet(null);
      toast(next.every(Boolean) ? 'every square has a drawing ✓' : `square ${sheet.slot + 1} done ✓`);
    }
  };
  const fillAll = () => {
    if (!chosen) return;
    const d = drawingFor(chosen);
    if (!d) return;
    setSlots((old) => [...Array.from({ length: count }, () => pickFor(d)), ...old.slice(count)]);
    setSheet(null);
    toast(`the same favourite in all ${count} squares ✓`);
  };
  const clearSquare = (i: number) => setSlots((old) => old.map((s, j) => (j === i ? null : s)));

  // ── basket ─────────────────────────────────────────────────────────────────────────────────
  const ready = filledCount > 0;
  const addToBasket = () => {
    if (!variant || !ready || blockedAt >= 0) return;
    const line = frameGridLine({ id: edit ?? newFrameLineId(), variant, slots: mine });
    if (edit) {
      const { id, ...fields } = line;
      update(edit, fields, id); // same line, same place, same copies
      toast('basket updated ✓');
    } else {
      add(line);
      toast('added to basket ✓');
    }
    writeDraft(null);
    router.push('/start-creating');
  };

  // ── states: loading / error / unavailable ──────────────────────────────────────────────────
  if (catalogueFailed) {
    return (
      <Shell>
        <div role="alert" className="pop-in mx-auto mt-10 max-w-sm rounded-[18px] border-2 border-cocoa bg-paper p-6 text-center text-sm text-ink-soft shadow-[0_3px_0_var(--color-cocoa)]">
          <p className="font-semibold text-cocoa">we couldn’t fetch the frame just now.</p>
          <Button variant="secondary" size="md" className="mt-4" onClick={loadCatalogue}>
            try again
          </Button>
        </div>
      </Shell>
    );
  }
  if (!products) {
    return (
      <Shell>
        <div role="status" aria-label="loading the multi photo frame" className="animate-pulse space-y-4 pt-2">
          <div className="h-9 w-1/2 rounded-full bg-paper-2" />
          <div className="flex gap-2">
            <div className="h-11 w-36 rounded-pill bg-paper-2" />
            <div className="h-11 w-36 rounded-pill bg-paper-2" />
          </div>
          <div className="mx-auto aspect-square max-w-md rounded-[12px] bg-paper-2" />
          <div className="grid grid-cols-3 gap-3 pt-3 sm:grid-cols-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-[10px] bg-paper-2" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }
  if (!product || !variant || !grid) {
    return (
      <Shell>
        <div className="pop-in mx-auto mt-10 max-w-sm rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-7 text-center text-sm text-ink-soft">
          That product isn’t available. <Link href="/start-creating" className="font-bold text-cinnamon underline">back to your collection</Link>.
        </div>
      </Shell>
    );
  }

  const sheetDrawing = chosen ? drawingFor(chosen) : null;
  const priceOf = (sz: FrameSize) => variants.find((v) => v.attributes.size === sz && v.attributes.colour === colourNow)?.pricePence ?? variants.find((v) => v.attributes.size === sz)?.pricePence ?? null;
  const gridOfSize = (sz: FrameSize) => frameGridOf(sz, 'landscape')!;

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start lg:gap-12">
        {/* Left (like every product page): the frame, big, with its squares under it */}
        <div className="min-w-0">
          <div className="polaroid tape relative mx-auto mt-3 w-full md:max-w-[min(100%,calc(100dvh-25rem))]">
            <div className="flex w-full items-center justify-center bg-paper-2 p-4">
              <FramePicture sku={variant.sku} squares={squares} alt={frameLabel(grid, colourNow ?? 'gold', squares.length, filledCount)}>
                <FramePreview grid={grid} squares={squares} own={mine} imageFor={(a) => drawingFor(a)?.thumbUrl ?? drawingFor(a)?.imageUrl ?? null} colour={colourNow ?? 'gold'} />
              </FramePicture>
            </div>
          </div>

          {/* The squares */}
          <div className="mt-6 flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Your {count} squares</h2>
            <span className="text-xs font-bold text-ink-soft" aria-live="polite">
              {filledCount} of {count} chosen
            </span>
          </div>
          {ready && filledCount < count ? (
            <CaveatNote className="mt-1 text-lg">the empty squares repeat your favourite ↻</CaveatNote>
          ) : null}
          <ol className={`mt-4 grid ${compact ? 'grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-6 lg:grid-cols-8' : 'grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4'}`} aria-label="the squares of your frame">
            {squares.map((c, i) => {
              const own = mine[i];
              const d = c ? drawingFor(c.assetId) : null;
              const q = c ? assess(c) : null;
              const badge = !q ? null : q.decision === 'BLOCK' ? 'too small to print' : q.softUpClose ? 'a little soft up close' : 'print-ready';
              if (compact) {
                // a big frame: picture-only squares, numbered, so the options aren't 40 tiles away on a
                // phone; a too-small drawing is ringed; "clear" lives in the picker sheet
                const src = d?.thumbUrl ?? d?.imageUrl ?? null;
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => openSheet(i, !own)}
                      aria-label={c ? `square ${i + 1}: ${own ? (d?.label ?? 'a drawing') : `repeats ${d?.label ?? 'a drawing'}`}${badge ? `, ${badge}` : ''} — ${own ? 'swap it' : 'pick its own drawing'}` : `pick a drawing for square ${i + 1}`}
                      className={`press relative block aspect-square w-full min-h-11 overflow-hidden rounded-[8px] border-2 bg-white ${q?.decision === 'BLOCK' ? 'border-cinnamon' : own ? 'border-cocoa' : 'border-dashed border-cocoa/30'}`}
                    >
                      {src ? <img src={src} alt="" loading="lazy" className={`h-full w-full object-cover ${own ? '' : 'opacity-50'}`} /> : null}
                      <span aria-hidden className="absolute bottom-0.5 left-0.5 rounded-[4px] bg-paper/90 px-1 text-[10px] font-extrabold leading-4 text-cocoa">
                        {i + 1}
                      </span>
                      {q?.decision === 'BLOCK' ? (
                        <span aria-hidden className="absolute right-0.5 top-0.5 text-cinnamon">
                          <Icon icon={IconAlertTriangle} size={14} />
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              }
              return (
                <li key={i} className="relative">
                  {c ? (
                    <div
                      className={`polaroid !p-1.5 ${own ? 'tape' : ''}`}
                      style={{ ['--tilt' as string]: i % 2 ? '1.2deg' : '-1.4deg', ['--tape' as string]: TAPES[i % TAPES.length], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg' }}
                    >
                      <div className={`relative aspect-square w-full overflow-hidden bg-white ${own ? '' : 'opacity-60'}`}>
                        {d?.thumbUrl ?? d?.imageUrl ? <img src={(d.thumbUrl ?? d.imageUrl)!} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-[10px] font-bold text-ink-faint">a drawing</span>}
                        <button
                          type="button"
                          onClick={() => openSheet(i, !own)}
                          aria-label={`square ${i + 1}: ${own ? (d?.label ?? 'a drawing') : `repeats ${d?.label ?? 'a drawing'}`}${badge ? `, ${badge}` : ''} — ${own ? 'swap it' : 'pick its own drawing'}`}
                          className="absolute inset-0 focus-visible:outline-2"
                        />
                        {!own ? (
                          <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cinnamon">
                              <Icon icon={IconPlus} size={16} />
                            </span>
                          </span>
                        ) : null}
                      </div>
                      {own ? (
                        <button
                          type="button"
                          onClick={() => clearSquare(i)}
                          aria-label={`clear square ${i + 1}`}
                          className="press absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa before:absolute before:-inset-[9px] before:content-[''] hover:text-cinnamon"
                        >
                          <Icon icon={IconX} size={13} />
                        </button>
                      ) : null}
                      <p className="mt-1 text-[11px] font-extrabold lowercase leading-tight text-cocoa" aria-hidden>
                        square {i + 1}
                        {!own ? <Icon icon={IconRepeat} size={11} className="ml-1 inline text-ink-faint" /> : null}
                      </p>
                      <p
                        className={`flex items-center gap-1 text-[10px] font-extrabold leading-tight ${q?.decision === 'BLOCK' ? 'text-cinnamon' : q?.softUpClose ? 'text-ink-soft' : 'text-green-save'}`}
                        aria-hidden
                      >
                        {badge ? <Icon icon={q?.decision === 'BLOCK' ? IconAlertTriangle : IconCircleCheck} size={12} /> : null}
                        {badge ?? ' '}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSheet(i, true)}
                      aria-label={`pick a drawing for square ${i + 1}`}
                      className="press flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-cocoa/30 bg-paper/60 text-cinnamon hover:border-cocoa"
                    >
                      <Icon icon={IconPlus} size={18} />
                      <span className="text-[11px] font-extrabold lowercase">square {i + 1}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Right: title → options → description → add to basket (bottom-right) */}
        <div className="flex flex-col">
          <h1 className="font-display text-[32px] leading-tight text-cocoa md:text-4xl">{product.label}</h1>
          <p className="mt-1 text-sm text-ink-soft">{product.blurb ?? 'a whole gallery of their art, in one frame'}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="sticker inline-flex rotate-[-2deg] rounded-[12px] bg-honey px-3 py-1 font-display text-2xl text-cocoa">{gbp(variant.pricePence)}</span>
            <span className="text-xs font-semibold text-green-save">{deliveryLine(variant.sku)}</span>
            <ChristmasPromise productKey={product.key} attrs={variant.attributes} />
          </div>

          {/* Size */}
          <div className="mt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Size</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="frame size">
              {sizes.map((sz) => {
                const p = priceOf(sz);
                const g = gridOfSize(sz);
                return (
                  <button key={sz} type="button" onClick={() => setSize(sz)} aria-pressed={sz === sizeNow} className={`${OPT} ${sz === sizeNow ? OPT_ON : OPT_OFF}`}>
                    <span className="flex flex-col items-start leading-tight">
                      <span>
                        {g.cols * g.rows} drawings{p ? ` · ${gbp(p)}` : ''}
                      </span>
                      <span className={`text-[10px] font-semibold ${sz === sizeNow ? 'text-paper' : 'text-ink-soft'}`}>
                        {g.cols} × {g.rows} · {sz}
                        {g.mounted ? ' · white mount' : ''}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">every drawing in its own 6 cm square, 2 cm apart</p>
          </div>

          {/* How it hangs — the two big sizes only */}
          {orientations.length > 1 ? (
            <div className="mt-5">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Hangs</p>
              <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="which way it hangs">
                {orientations.map((o) => {
                  const g = frameGridOf(sizeNow, o)!;
                  return (
                    <button key={o} type="button" onClick={() => setOrientation(o)} aria-pressed={o === orientationNow} className={`${OPT} ${o === orientationNow ? OPT_ON : OPT_OFF}`}>
                      {o} · {g.cols} across, {g.rows} down
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Frame colour */}
          <div className="mt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Frame</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="frame colour">
              {coloursNow.map((c) => (
                <button key={c} type="button" onClick={() => setColour(c)} aria-pressed={c === colourNow} className={`${OPT} gap-1.5 ${c === colourNow ? OPT_ON : OPT_OFF}`}>
                  <span aria-hidden className="h-4 w-4 rounded-full border-2 border-paper outline outline-1 outline-cocoa/30" style={{ backgroundColor: FRAME_MOULDING_HEX[c] ?? 'var(--color-line)' }} />
                  {c}
                </button>
              ))}
            </div>
          </div>

          <ProductDetails description={product.description} specs={product.specs} />

          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none md:flex md:flex-col md:items-end">
            {blockedAt >= 0 ? (
              <p role="status" className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold text-cocoa">
                <Icon icon={IconAlertTriangle} size={15} className="mt-px shrink-0 text-cinnamon" />
                the drawing in square {blockedAt + 1} is too small to print — tap it to swap.
              </p>
            ) : null}
            {ready ? (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={addToBasket} disabled={blockedAt >= 0}>
                <Icon icon={IconShoppingBag} size={16} /> {edit ? 'update basket' : 'add to basket'} · {gbp(variant.pricePence)}
              </Button>
            ) : (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => openSheet(0, true)}>
                <Icon icon={IconPlus} size={16} /> pick a drawing for square 1
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* The keepsake picker — a bottom sheet on phones, a centred card from md. */}
      <Modal
        open={sheet !== null}
        onClose={() => setSheet(null)}
        size="md"
        title={sheet ? `pick a drawing for square ${sheet.slot + 1}` : 'pick a drawing'}
        subtitle="from your keepsake box"
        footer={
          drawings.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="md" className="flex-1 !px-3" onClick={fillAll} disabled={!sheetDrawing?.printable}>
                use it in every square
              </Button>
              <Button size="md" className="flex-1 !px-3" onClick={putInSquare} disabled={!sheetDrawing?.printable}>
                put it in square {(sheet?.slot ?? 0) + 1}
              </Button>
              {compact && sheet && mine[sheet.slot] ? (
                // (the compact squares have no × of their own)
                <Button
                  variant="secondary"
                  size="md"
                  className="!px-3"
                  aria-label={`clear square ${sheet.slot + 1}`}
                  onClick={() => {
                    clearSquare(sheet.slot);
                    setSheet(null);
                  }}
                >
                  <Icon icon={IconX} size={16} />
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <PickerBody picker={picker} drawings={drawings} chosen={chosen} onChoose={setChosen} onRetry={loadPicker} next={NEXT} forWhat="a frame" tools={tools} />
      </Modal>
    </Shell>
  );
}

/** What the frame's picture shows, in words (the photo and the drawn stand-in say the same). */
const frameLabel = (grid: FrameGrid, colour: string, squares: number, chosen: number) =>
  `your ${grid.size} ${grid.orientation === 'square' ? '' : `${grid.orientation} `}frame in ${colour}: ${squares} squares, ${chosen} chosen${chosen < squares && chosen > 0 ? ', the rest repeat the first drawing' : ''}`;

/**
 * The frame as it really is: the founder's photo of this size in this colour with each square's own
 * drawing, composed server-side (/api/mockup/frame — every drawing authz-checked there, nothing stored).
 * Until it lands — or where the frame's layers aren't seeded — the drawn preview (`children`) stands in;
 * the last picture stays up while the next is made, and an older set is never shown as this one.
 */
function FramePicture({ sku, squares, alt, children }: { sku: string; squares: Slot[]; alt: string; children: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const filled = squares.every(Boolean) && squares.length > 0;
  const body = filled ? JSON.stringify({ sku, squares: squares.map((c) => ({ assetId: c!.assetId, transform: c!.transform, ...(c!.sourceObjectId ? { sourceObjectId: c!.sourceObjectId } : {}) })) }) : null;
  useEffect(() => {
    if (!body) {
      setUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      return;
    }
    let stale = false;
    setBusy(true);
    // a short pause: a run of quick picks makes one picture, not five
    const t = window.setTimeout(() => {
      fetch('/api/mockup/frame', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          if (stale) return;
          const next = URL.createObjectURL(blob);
          setUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return next;
          });
          setBusy(false);
        })
        .catch(() => {
          if (stale) return;
          // the drawn frame stands in — never an older set as if it were this one
          setUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return null;
          });
          setBusy(false);
        });
    }, 250);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [body]);
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    urlRef.current = url;
  }, [url]);
  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);
  if (!url) return <>{children}</>;
  return (
    <div className="relative w-full" aria-busy={busy}>
      <img src={url} alt={alt} className="block aspect-square w-full object-contain" />
      {busy ? <span aria-hidden className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-honey motion-safe:animate-pulse" /> : null}
    </div>
  );
}

/**
 * The frame at a glance, drawn at the PRINT's own geometry: the moulding in its colour, the white
 * sheet, every square where it prints (frameSlotRects), each drawing filling its square exactly as
 * its tile does (cover, the bleed under the mount cropped by the window) — and on the 16×16″ the
 * snow-white mount over it. Squares that repeat the main drawing show it too: that's what prints.
 */
function FramePreview({ grid, squares, own, imageFor, colour }: { grid: FrameGrid; squares: Slot[]; own: Slot[]; imageFor: (assetId: string) => string | null; colour: string }) {
  const rects = frameSlotRects(grid);
  const bleed = slotBleedPx(grid);
  const pctX = (px: number) => `${(px / grid.pxW) * 100}%`;
  const pctY = (px: number) => `${(px / grid.pxH) * 100}%`;
  // the moulding, the same on every side: a share of the frame's longer side, as a fraction of its
  // WIDTH (CSS % padding is always of the width). The outer shape then follows so the sheet inside
  // keeps the print's own shape: inner w/h = (1 − 2p) / (1/A − 2p) = wMm/hMm.
  const p = 0.045 * (Math.max(grid.wMm, grid.hMm) / grid.wMm);
  const outerAspect = 1 / (2 * p + (1 - 2 * p) * (grid.hMm / grid.wMm));
  const chosen = own.filter(Boolean).length;
  return (
    <div
      role="img"
      aria-label={frameLabel(grid, colour, squares.length, chosen)}
      className="relative rounded-[3px] shadow-[0_8px_18px_rgb(43_33_24/0.25)]"
      style={{
        backgroundColor: FRAME_MOULDING_HEX[colour] ?? FRAME_MOULDING_HEX.gold,
        // the frame at its true shape (moulding included); a portrait one narrower, so it's never taller than wide-ish
        aspectRatio: String(outerAspect),
        width: grid.hMm > grid.wMm ? `${Math.round(outerAspect * 100)}%` : '100%',
        maxWidth: grid.hMm > grid.wMm ? undefined : '520px',
        padding: `${p * 100}%`,
      }}
    >
      <div className="relative h-full w-full overflow-hidden bg-white shadow-[inset_0_0_6px_rgb(43_33_24/0.35)]">
        {squares.map((c, i) => {
          const r = rects[i]!;
          const url = c ? imageFor(c.assetId) : null;
          return (
            <div key={i} className={`absolute overflow-hidden ${grid.mounted ? 'shadow-[inset_1px_1px_2px_rgb(43_33_24/0.3)]' : ''} ${c ? '' : 'border border-dashed border-cocoa/25 bg-paper-2'}`} style={{ left: pctX(r.x), top: pctY(r.y), width: pctX(r.size), height: pctY(r.size) }}>
              {url ? (
                // the tile is the window + its bleed; the window shows its middle
                <img src={url} alt="" className="absolute max-w-none object-cover" style={{ left: `${(-bleed / r.size) * 100}%`, top: `${(-bleed / r.size) * 100}%`, width: `${((r.size + 2 * bleed) / r.size) * 100}%`, height: `${((r.size + 2 * bleed) / r.size) * 100}%` }} />
              ) : null}
            </div>
          );
        })}
      </div>
      <span className="absolute -right-2 -top-3 z-20 rotate-6 rounded-pill border-2 border-cocoa bg-honey px-3 py-1 text-xs font-extrabold text-cocoa shadow-[0_2px_0_var(--color-cocoa)]">
        {grid.cols * grid.rows} drawings
      </span>
    </div>
  );
}

// Scrapbook option chips (D12): ≥44px stickers — ink outline; the chosen one fills with ink.
const OPT = 'press inline-flex min-h-11 items-center rounded-pill border-2 px-3.5 text-xs font-bold';
const OPT_ON = 'border-cocoa bg-cocoa text-paper shadow-[0_2px_0_var(--color-cocoa)]';
const OPT_OFF = 'border-cocoa/25 bg-paper text-ink-soft hover:border-cocoa';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/start-creating', label: 'Back to your collection' }} />
      {/* pb-40 on phones clears the fixed thumb-zone action dock. */}
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-40 pt-6 md:px-6 md:pb-10 2xl:max-w-[1600px]">{children}</main>
    </div>
  );
}
