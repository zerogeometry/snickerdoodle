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
import { CalendarFlipPreview } from './CalendarFlipPreview';
import { ChristmasPromise } from './ChristmasPromise';
import { ProductDetails } from './ProductDetails';
import { PickerBody, type Drawing, type PickerState } from './CardPackBuilder';
import { forgetResumeVisit, isResumeVisit, usePickerEdits } from './usePickerEdits';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { keepsakePickerAction } from '@/app/actions/keepsakePicker';
import type { CatalogueProduct } from '@/server/catalogue';
import { clampTransform, type ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { CALENDAR_KEY, CALENDAR_PAGE_COUNT, CALENDAR_YEAR, fillCalendarPages, MONTH_SHORT, pageLabel } from '@/lib/calendar';
import { calendarLine, newCalendarLineId } from '@/lib/calendar-line';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { deliveryLine } from '@/lib/delivery';
import { gbp, shownSrc, toast, useBasket, useUpload, type PackCardLine } from '@/lib/store';

/**
 * The dated 2027 WALL CALENDAR builder (CHRISTMAS-range-and-postage.md §5): choose A5 or A4 → put
 * up to 12 drawings + a cover on its pages (from the keepsake box, or the drawing in progress; any
 * page left empty repeats the chosen drawings, so ONE drawing makes a whole calendar) → flip through
 * it, cover to December, with a print-quality badge on every page → add ONE basket line.
 *
 * Not in /mockups — extends the Scrapbook language of the card-pack builder (taped polaroid pages,
 * ink chips, the kraft thumb-zone dock, the bottom-sheet picker). The price shown is the catalogue's;
 * the server re-prices the calendar and re-checks every page (authz, moderation, DPI) at order time.
 */

type Slot = PackCardLine | null;

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];
const PICKER_TTL_MS = 8 * 60_000; // signed URLs live 10 min — refresh the list before they lapse
const PLACE: PackCardLine['transform'] = defaultTransformFor(CALENDAR_KEY); // fills each page without stretching (founder, 26 Oct)
const DRAFT_KEY = 'sd_calendar_draft'; // per tab: picks survive a trip to upload a new drawing
const NEXT = '/customize/calendar';

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const tileName = (i: number) => (i === 0 ? 'cover' : MONTH_SHORT[i - 1]!);

function readDraft(): { variantId: string | null; slots: Slot[] } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    const d = raw ? (JSON.parse(raw) as { variantId?: unknown; slots?: unknown }) : null;
    if (!d || !Array.isArray(d.slots)) return null;
    const slots = d.slots.slice(0, CALENDAR_PAGE_COUNT).map((s) => (s && typeof s === 'object' && typeof (s as Slot)!.assetId === 'string' ? (s as PackCardLine) : null));
    return { variantId: typeof d.variantId === 'string' ? d.variantId : null, slots };
  } catch {
    return null;
  }
}
function writeDraft(d: { variantId: string | null; slots: Slot[] } | null) {
  try {
    if (d) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // storage unavailable — the draft just doesn't survive a reload
  }
}

export function CalendarBuilder() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const add = useBasket((s) => s.add);
  const update = useBasket((s) => s.update);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>(() => Array.from({ length: CALENDAR_PAGE_COUNT }, () => null));
  const [edit, setEdit] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ status: 'loading' });
  // Which page the sheet is filling (null = closed), and whether it steps on to the next page after
  // placing one (true when it was opened to FILL, false when swapping one).
  const [sheet, setSheet] = useState<{ slot: number; advance: boolean } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [dims, setDims] = useState<Record<string, { width: number; height: number } | null>>({});
  const [page, setPage] = useState(0); // the page on show in the flip-through

  // ── load: the catalogue and the keepsake box ──────────────────────────────────────────────
  const loadCatalogue = useCallback(() => {
    setCatalogueFailed(false);
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

  const product = products?.find((p) => p.key === CALENDAR_KEY) ?? null;
  const variants = product?.variants ?? [];
  const variant = variants.find((v) => v.id === variantId) ?? variants.find((v) => v.isDefault) ?? variants[0] ?? null;

  // Seed once the product is known: a basket line (?edit=<lineId>) reopens exactly that calendar;
  // otherwise this tab's draft; otherwise the drawing in progress goes on the cover — so the very
  // first view is already a whole calendar of it.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!product || seededRef.current) return;
    seededRef.current = true;
    const id = new URLSearchParams(window.location.search).get('edit');
    const line = id ? useBasket.getState().items.find((i) => i.id === id && i.pages?.length) : null;
    if (line) {
      setEdit(line.id);
      if (line.variantId) setVariantId(line.variantId);
      setSlots(Array.from({ length: CALENDAR_PAGE_COUNT }, (_, i) => (line.pages![i] ? { ...line.pages![i]! } : null)));
      return;
    }
    // this tab's draft — only on the way back from the Studio; any other visit starts fresh
    const resuming = isResumeVisit();
    forgetResumeVisit();
    if (!resuming) writeDraft(null);
    const draft = resuming ? readDraft() : null;
    if (draft?.slots.some(Boolean)) {
      if (draft.variantId) setVariantId(draft.variantId);
      setSlots(Array.from({ length: CALENDAR_PAGE_COUNT }, (_, i) => draft.slots[i] ?? null));
      return;
    }
    const u = useUpload.getState().upload;
    if (u?.assetId) setSlots((s) => [{ assetId: u.assetId!, transform: PLACE, ...(u.cutout?.sourceObjectId ? { sourceObjectId: u.cutout.sourceObjectId } : {}) }, ...s.slice(1)]);
  }, [product]);

  // Keep this tab's draft (not while editing a basket line — that line IS the saved state).
  useEffect(() => {
    if (!seededRef.current || edit) return;
    writeDraft(slots.some(Boolean) ? { variantId: variant?.id ?? null, slots } : null);
  }, [slots, variant, edit]);

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
        list.push({ assetId: k.id, imageUrl: k.imageUrl, thumbUrl: k.thumbUrl ?? null, ...(k.sourceObjectId ? { sourceObjectId: k.sourceObjectId } : {}), label: k.childFirstName ? `${k.childFirstName} · ${when}` : `kept ${when}`, printable: true }); // the ORDER holds anything screening hasn't cleared (orders.ts, D8) — designing with it is fine, as on the create page
      }
    }
    return list;
  }, [upload, picker]);
  const tools = usePickerEdits({ returnTo: `${NEXT}?resume=1`, onUploaded: loadPicker, sheet });
  // back from the Studio: the picker open again on the page it was filling, the edited drawing chosen
  const { resume, clearResume } = tools;
  useEffect(() => {
    if (!resume || !product) return;
    clearResume();
    setSheet(resume.sheet);
    setChosen(resume.assetId);
  }, [resume, clearResume, product]);
  const applyEdits = tools.apply;
  const drawings = useMemo(() => applyEdits(drawingsRaw), [applyEdits, drawingsRaw]);
  // a drawing edited here (remove background, the Studio) → every page already showing it shows the edit
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

  // What prints: every page, the gaps repeating the chosen drawings (the server does the same).
  const filledCount = slots.filter(Boolean).length;
  const pages: Slot[] = useMemo(() => (filledCount > 0 ? fillCalendarPages(slots) : slots), [slots, filledCount]);

  // The pixel size of each drawing — fed to the SAME assessment the order-time gate runs, per page.
  useEffect(() => {
    const started = new Set<string>();
    for (const c of pages) {
      if (!c) continue;
      const d = drawings.find((x) => x.assetId === c.assetId);
      const key = `${c.assetId}:${c.sourceObjectId ?? ''}`;
      if (!d?.imageUrl || key in dims || started.has(key)) continue;
      started.add(key);
      setDims((m) => ({ ...m, [key]: null }));
      const img = new window.Image();
      img.onload = () => setDims((m) => ({ ...m, [key]: img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null }));
      img.src = d.imageUrl;
    }
  }, [pages, drawings, dims]);

  const printGeom = variant?.printGeom ?? null;
  const dimsOf = useCallback((c: PackCardLine) => dims[`${c.assetId}:${c.sourceObjectId ?? ''}`] ?? null, [dims]);
  const assess = (c: PackCardLine): ResolutionAssessment | null => {
    const src = dimsOf(c);
    return printGeom && src ? assessPrintResolution(printGeom, src, clampTransform(c.transform), CALENDAR_KEY) : null;
  };
  const blockedAt = pages.findIndex((c) => c && assess(c)?.decision === 'BLOCK');

  // ── picking ────────────────────────────────────────────────────────────────────────────────
  const openSheet = (slot: number, advance: boolean) => {
    if (picker.status === 'ready' && Date.now() - picker.at > PICKER_TTL_MS) loadPicker();
    setChosen(slots[slot]?.assetId ?? null);
    setAnnounce('');
    setSheet({ slot, advance });
    setPage(slot);
  };
  const firstEmpty = (list: Slot[], from = 0) => {
    for (let i = 0; i < CALENDAR_PAGE_COUNT; i++) {
      const j = (from + i) % CALENDAR_PAGE_COUNT;
      if (!list[j]) return j;
    }
    return -1;
  };
  const pickFor = (d: Drawing): PackCardLine => ({ assetId: d.assetId, transform: PLACE, ...(d.sourceObjectId ? { sourceObjectId: d.sourceObjectId } : {}) });

  const putOnPage = () => {
    if (!sheet || !chosen) return;
    const d = drawingFor(chosen);
    if (!d) return;
    const next = [...slots];
    next[sheet.slot] = pickFor(d);
    setSlots(next);
    setPage(sheet.slot);
    const nextEmpty = sheet.advance ? firstEmpty(next, sheet.slot + 1) : -1;
    if (nextEmpty >= 0 && nextEmpty > sheet.slot) {
      setSheet({ slot: nextEmpty, advance: true });
      setChosen(null);
      setAnnounce(`${pageLabel(sheet.slot)} done — now ${pageLabel(nextEmpty)}`);
    } else {
      setSheet(null);
      toast(`${pageLabel(sheet.slot)} done ✓`);
    }
  };
  const fillAll = () => {
    if (!chosen) return;
    const d = drawingFor(chosen);
    if (!d) return;
    setSlots(Array.from({ length: CALENDAR_PAGE_COUNT }, () => pickFor(d)));
    setSheet(null);
    toast('the same favourite on every page ✓');
  };
  const clearPage = (i: number) => setSlots((old) => old.map((s, j) => (j === i ? null : s)));

  // ── basket ─────────────────────────────────────────────────────────────────────────────────
  const ready = filledCount > 0;
  const addToBasket = () => {
    if (!variant || !ready || blockedAt >= 0) return;
    const line = calendarLine({ id: edit ?? newCalendarLineId(), variant, slots });
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
          <p className="font-semibold text-cocoa">we couldn’t fetch the calendar just now.</p>
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
        <div role="status" aria-label="loading the calendar" className="animate-pulse space-y-4 pt-2">
          <div className="h-9 w-1/2 rounded-full bg-paper-2" />
          <div className="flex gap-2">
            <div className="h-11 w-28 rounded-pill bg-paper-2" />
            <div className="h-11 w-28 rounded-pill bg-paper-2" />
          </div>
          <div className="mx-auto aspect-[297/240] max-w-md rounded-[12px] bg-paper-2" />
          <div className="grid grid-cols-4 gap-3 pt-3 sm:grid-cols-7">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[297/210] rounded-[10px] bg-paper-2" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }
  if (!product || !variant) {
    return (
      <Shell>
        <div className="pop-in mx-auto mt-10 max-w-sm rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-7 text-center text-sm text-ink-soft">
          That product isn’t available. <Link href="/start-creating" className="font-bold text-cinnamon underline">back to your collection</Link>.
        </div>
      </Shell>
    );
  }

  const sheetDrawing = chosen ? drawingFor(chosen) : null;
  const distinct = new Set(slots.filter(Boolean).map((s) => s!.assetId)).size;

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start lg:gap-12">
        {/* Left (like every product page): the calendar, big — flip through it — with its pages under it */}
        <div className="min-w-0">
          {/* The flip-through */}
          <div className="mt-3">
            <CalendarFlipPreview
              pages={pages}
              imageFor={(p) => drawingFor(p.assetId)?.imageUrl ?? null}
              dimsFor={dimsOf}
              geom={printGeom}
              page={page}
              onPage={setPage}
            />
            <p className="mt-2 text-center text-xs text-ink-soft">every page shows the whole drawing on white, with a little border — like a gallery print</p>
          </div>

          {/* The pages */}
          <div className="mt-6 flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Your pages</h2>
            <span className="text-xs font-bold text-ink-soft" aria-live="polite">
              {filledCount} of {CALENDAR_PAGE_COUNT} chosen
            </span>
          </div>
          {ready && filledCount < CALENDAR_PAGE_COUNT ? (
            <CaveatNote className="mt-1 text-lg">the rest repeat your favourite{distinct === 1 ? '' : 's'} ↻</CaveatNote>
          ) : null}
          <ol className="mt-4 grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4" aria-label="the pages of your calendar">
            {pages.map((c, i) => {
              const own = slots[i];
              const d = c ? drawingFor(c.assetId) : null;
              const q = c ? assess(c) : null;
              const badge = !q ? null : q.decision === 'BLOCK' ? 'too small to print' : q.softUpClose ? 'a little soft up close' : 'print-ready';
              const label = pageLabel(i);
              return (
                <li key={i} className="relative">
                  {c ? (
                    <div
                      className={`polaroid !p-1.5 ${own ? 'tape' : ''}`}
                      style={{ ['--tilt' as string]: i % 2 ? '1.2deg' : '-1.4deg', ['--tape' as string]: TAPES[i % TAPES.length], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg' }}
                    >
                      <div className={`relative aspect-[297/210] w-full overflow-hidden bg-white ${own ? '' : 'opacity-60'}`}>
                        {d?.thumbUrl ?? d?.imageUrl ? <img src={(d.thumbUrl ?? d.imageUrl)!} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-[10px] font-bold text-ink-faint">a drawing</span>}
                        <button
                          type="button"
                          onClick={() => openSheet(i, !own)}
                          aria-label={`${label}: ${own ? (d?.label ?? 'a drawing') : `repeats ${d?.label ?? 'a drawing'}`}${badge ? `, ${badge}` : ''} — ${own ? 'swap it' : 'pick its own drawing'}`}
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
                          onClick={() => clearPage(i)}
                          aria-label={`clear ${label}`}
                          className="press absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa before:absolute before:-inset-[9px] before:content-[''] hover:text-cinnamon"
                        >
                          <Icon icon={IconX} size={13} />
                        </button>
                      ) : null}
                      <p className="mt-1 text-[11px] font-extrabold lowercase leading-tight text-cocoa" aria-hidden>
                        {tileName(i)}
                        {!own ? <Icon icon={IconRepeat} size={11} className="ml-1 inline text-ink-faint" /> : null}
                      </p>
                      <p
                        className={`flex items-center gap-1 text-[10px] font-extrabold leading-tight ${q?.decision === 'BLOCK' ? 'text-cinnamon' : q?.softUpClose ? 'text-ink-soft' : 'text-green-save'}`}
                        aria-hidden
                      >
                        {badge ? <Icon icon={q?.decision === 'BLOCK' ? IconAlertTriangle : IconCircleCheck} size={12} /> : null}
                        {badge ?? ' '}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSheet(i, true)}
                      aria-label={`pick a drawing for ${label}`}
                      className="press flex aspect-[297/210] w-full flex-col items-center justify-center gap-1 rounded-[10px] border-2 border-dashed border-cocoa/30 bg-paper/60 text-cinnamon hover:border-cocoa"
                    >
                      <Icon icon={IconPlus} size={18} />
                      <span className="text-[11px] font-extrabold lowercase">{tileName(i)}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Right: title → options → description → add to basket (bottom-right) */}
        <div className="flex flex-col">
          <h1 className="font-display text-[32px] leading-tight text-cocoa md:text-4xl">{CALENDAR_YEAR} calendar</h1>
          <p className="mt-1 text-sm text-ink-soft">{product.blurb ?? 'a year of their masterpieces'} — a drawing for every month, and one on the cover.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="sticker inline-flex rotate-[-2deg] rounded-[12px] bg-honey px-3 py-1 font-display text-2xl text-cocoa">{gbp(variant.pricePence)}</span>
            <span className="text-xs font-semibold text-green-save">{deliveryLine(variant.sku)}</span>
            <ChristmasPromise productKey={product.key} attrs={variant.attributes} />
          </div>

          {/* Size */}
          <div className="mt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Size</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="calendar size">
              {variants.map((v) => (
                <button key={v.id} type="button" onClick={() => setVariantId(v.id)} aria-pressed={v.id === variant.id} className={`${OPT} ${v.id === variant.id ? OPT_ON : OPT_OFF}`}>
                  {v.attributes.size ?? 'calendar'} · {gbp(v.pricePence)}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-faint">landscape, to hang on the wall · the {CALENDAR_YEAR} dates printed under every month</p>
          </div>


          <ProductDetails description={product.description} specs={product.specs} />

          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none md:flex md:flex-col md:items-end">
            {blockedAt >= 0 ? (
              <p role="status" className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold text-cocoa">
                <Icon icon={IconAlertTriangle} size={15} className="mt-px shrink-0 text-cinnamon" />
                the drawing on {pageLabel(blockedAt)} is too small to print at {variant.attributes.size ?? 'this size'} — tap it to swap, or try the smaller size.
              </p>
            ) : null}
            {ready ? (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={addToBasket} disabled={blockedAt >= 0}>
                <Icon icon={IconShoppingBag} size={16} /> {edit ? 'update basket' : 'add to basket'} · {gbp(variant.pricePence)}
              </Button>
            ) : (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => openSheet(0, true)}>
                <Icon icon={IconPlus} size={16} /> pick a drawing for the cover
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
        title={sheet ? `pick a drawing for ${sheet.slot === 0 ? 'the cover' : pageLabel(sheet.slot)}` : 'pick a drawing'}
        subtitle="from your keepsake box"
        footer={
          drawings.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="md" className="flex-1 !px-3" onClick={fillAll} disabled={!sheetDrawing?.printable}>
                use it on every page
              </Button>
              <Button size="md" className="flex-1 !px-3" onClick={putOnPage} disabled={!sheetDrawing?.printable}>
                put it on {sheet?.slot === 0 ? 'the cover' : pageLabel(sheet?.slot ?? 0)}
              </Button>
            </div>
          ) : null
        }
      >
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <PickerBody picker={picker} drawings={drawings} chosen={chosen} onChoose={setChosen} onRetry={loadPicker} next={NEXT} forWhat="a calendar page" tools={tools} />
      </Modal>
    </Shell>
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
