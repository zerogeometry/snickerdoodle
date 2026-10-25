'use client';

import { IconAlertTriangle, IconCards, IconCircleCheck, IconPlus, IconShoppingBag, IconX } from '@tabler/icons-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { FlowHeader } from './FlowHeader';
import { BaseColourPicker } from './BaseColourPicker';
import { MockupPreview } from './MockupPreview';
import { TileSkeletonGrid } from './TileSkeleton';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { keepsakePickerAction } from '@/app/actions/keepsakePicker';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';
import type { PickerKeepsake } from '@/server/keepsakePicker';
import { clampTransform, type ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { CARD_PACK_KEY, packSizeOf } from '@/lib/card-packs';
import { cardPackLine, newPackLineId } from '@/lib/card-pack-line';
import { isColouredGround, PATTERN_GROUND_WHITE } from '@/lib/patterns';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { gbp, toast, useBasket, useUpload, type PackCardLine, type PlacementTransform } from '@/lib/store';

/**
 * The greetings-card PACK builder (D22): choose a pack of 5 or 10 → put a drawing on every card
 * (from the keepsake box, or the drawing in progress; repeats welcome, "use it on all") → see the
 * fronts with a print-quality badge each → add ONE basket line carrying the cards. Blank inside.
 * One BASE COLOUR for the whole pack (the same wheel as every other product) fills every card's
 * front behind its drawing.
 *
 * Not in /mockups — extends the Scrapbook language (taped cards, ink chips, the kraft thumb-zone
 * dock, the bottom-sheet picker). The price shown is the catalogue's; the server re-prices the pack
 * and re-checks every card (authz, moderation, DPI) at order time.
 */

/** A drawing that can go on a card. */
export type Drawing = { assetId: string; imageUrl: string | null; sourceObjectId?: string; label: string; printable: boolean };
type Slot = PackCardLine | null;
export type PickerState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; signedIn: boolean; keepsakes: PickerKeepsake[]; at: number };

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];
const PICKER_TTL_MS = 8 * 60_000; // signed URLs live 10 min — refresh the list before they lapse
const COVER: PlacementTransform = defaultTransformFor(CARD_PACK_KEY);

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function CardPackBuilder() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const add = useBasket((s) => s.add);
  const update = useBasket((s) => s.update);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [catalogueFailed, setCatalogueFailed] = useState(false);
  const [variantId, setVariantId] = useState<string | null>(null);
  // Kept as long as the biggest pack seen, so 10 → 5 → 10 doesn't lose cards 6–10.
  const [slots, setSlots] = useState<Slot[]>([]);
  const [edit, setEdit] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ status: 'loading' });
  // Which card the sheet is filling (null = closed), and whether it should step on to the next
  // empty card after placing one (true when it was opened to FILL, false when swapping one).
  const [sheet, setSheet] = useState<{ slot: number; advance: boolean } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');
  const [dims, setDims] = useState<Record<string, { width: number; height: number } | null>>({});
  // the pack's ONE base colour — every card's front, behind its drawing (white = none)
  const [ground, setGround] = useState<string>(PATTERN_GROUND_WHITE);
  const groundOrNone = isColouredGround(ground) ? ground : undefined;

  // ── load: the catalogue (pack + the single card it previews on) and the keepsake box ──────
  const loadCatalogue = useCallback(() => {
    setCatalogueFailed(false);
    // The pack is HIDDEN until it graduates: ask for the curation view, which only a dev server
    // honours (the action refuses includeHidden in production, so there the pack stays unavailable).
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

  const pack = products?.find((p) => p.key === CARD_PACK_KEY) ?? null;
  const card = products?.find((p) => p.key === 'card') ?? null;
  const sizes = useMemo(
    () => (pack?.variants ?? []).map((v) => ({ v, n: packSizeOf(v.attributes.size) })).filter((x): x is { v: CatalogueVariant; n: number } => x.n !== null).sort((a, b) => a.n - b.n),
    [pack],
  );
  const chosenSize = sizes.find((s) => s.v.id === variantId) ?? sizes.find((s) => s.v.isDefault) ?? sizes[0] ?? null;
  const packSize = chosenSize?.n ?? 0;
  const variant = chosenSize?.v ?? null;
  const cards = useMemo(() => Array.from({ length: packSize }, (_, i) => slots[i] ?? null), [slots, packSize]);
  const filled = cards.filter(Boolean).length;

  // Edit seed: arrived from a basket pack line (?edit=<lineId>) — reopen exactly that pack.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!pack || seededRef.current) return;
    seededRef.current = true;
    const id = new URLSearchParams(window.location.search).get('edit');
    const line = id ? useBasket.getState().items.find((i) => i.id === id && i.cards) : null;
    if (!line) return;
    setEdit(line.id);
    if (line.variantId) setVariantId(line.variantId);
    setSlots(line.cards!.map((c) => ({ ...c })));
    setGround(line.ground ?? PATTERN_GROUND_WHITE);
  }, [pack]);

  // Every drawing on offer: the one in progress first (so a guest can make a pack of a favourite
  // before signing up), then the keepsake box. One entry per drawing.
  const drawings = useMemo(() => {
    const list: Drawing[] = [];
    if (upload?.assetId) {
      list.push({ assetId: upload.assetId, imageUrl: upload.cutout?.url ?? upload.dataUrl, sourceObjectId: upload.cutout?.sourceObjectId, label: 'this drawing', printable: true });
    }
    if (picker.status === 'ready') {
      for (const k of picker.keepsakes) {
        if (list.some((d) => d.assetId === k.id)) continue;
        const when = shortDate(k.createdAtISO);
        list.push({ assetId: k.id, imageUrl: k.imageUrl, label: k.childFirstName ? `${k.childFirstName} · ${when}` : `kept ${when}`, printable: k.printable });
      }
    }
    return list;
  }, [upload, picker]);
  const drawingFor = (assetId: string) => drawings.find((d) => d.assetId === assetId) ?? null;

  // The pixel size of each drawing on a card — fed to the SAME assessment the order-time gate runs.
  useEffect(() => {
    const started = new Set<string>();
    for (const c of cards) {
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
  }, [cards, drawings, dims]);

  const printGeom = variant?.printGeom ?? card?.variants[0]?.printGeom ?? null;
  const assess = (c: PackCardLine): ResolutionAssessment | null => {
    const src = dims[`${c.assetId}:${c.sourceObjectId ?? ''}`];
    return printGeom && src ? assessPrintResolution(printGeom, src, clampTransform(c.transform), CARD_PACK_KEY) : null;
  };
  const blockedAt = cards.findIndex((c) => c && assess(c)?.decision === 'BLOCK');

  // ── picking ────────────────────────────────────────────────────────────────────────────────
  const openSheet = (slot: number, advance: boolean) => {
    if (picker.status === 'ready' && Date.now() - picker.at > PICKER_TTL_MS) loadPicker();
    setChosen(cards[slot]?.assetId ?? null);
    setAnnounce('');
    setSheet({ slot, advance });
  };
  const firstEmpty = (list: Slot[], from = 0) => {
    for (let i = 0; i < packSize; i++) {
      const j = (from + i) % packSize;
      if (!list[j]) return j;
    }
    return -1;
  };
  const cardFor = (d: Drawing): PackCardLine => ({ assetId: d.assetId, transform: COVER, ...(d.sourceObjectId ? { sourceObjectId: d.sourceObjectId } : {}) });

  const putOnCard = () => {
    if (!sheet || !chosen) return;
    const d = drawingFor(chosen);
    if (!d) return;
    const next = [...cards];
    next[sheet.slot] = cardFor(d);
    setSlots((old) => [...next, ...old.slice(packSize)]);
    const nextEmpty = sheet.advance ? firstEmpty(next, sheet.slot + 1) : -1;
    if (nextEmpty >= 0) {
      setSheet({ slot: nextEmpty, advance: true });
      setChosen(null);
      setAnnounce(`card ${sheet.slot + 1} done — now card ${nextEmpty + 1}`);
    } else {
      setSheet(null);
      toast(next.every(Boolean) ? 'every card has a drawing ✓' : `card ${sheet.slot + 1} done ✓`);
    }
  };
  const fillAll = () => {
    if (!chosen) return;
    const d = drawingFor(chosen);
    if (!d) return;
    setSlots((old) => [...Array.from({ length: packSize }, () => cardFor(d)), ...old.slice(packSize)]);
    setSheet(null);
    toast(`the same favourite on all ${packSize} ✓`);
  };
  const emptyCard = (i: number) => setSlots((old) => old.map((s, j) => (j === i ? null : s)));

  // ── basket ─────────────────────────────────────────────────────────────────────────────────
  const complete = packSize > 0 && filled === packSize;
  const addToBasket = () => {
    if (!variant || !complete || blockedAt >= 0) return;
    // the colour is part of the line id (cardPackLine) — an edit that changes it re-keys the same line
    const line = cardPackLine({ id: edit ?? newPackLineId(), variant, packSize, cards: cards as PackCardLine[], previewVariantId: card?.variants[0]?.id, ground });
    if (edit) {
      const { id, ...fields } = line;
      update(edit, fields, id); // same line, same place — qty stays 1
      toast('basket updated ✓');
    } else {
      add(line);
      toast('added to basket ✓');
    }
    router.push('/start-creating');
  };

  // ── states: loading / error / unavailable ──────────────────────────────────────────────────
  if (catalogueFailed) {
    return (
      <Shell>
        <div role="alert" className="pop-in mx-auto mt-10 max-w-sm rounded-[18px] border-2 border-cocoa bg-paper p-6 text-center text-sm text-ink-soft shadow-[0_3px_0_var(--color-cocoa)]">
          <p className="font-semibold text-cocoa">we couldn’t fetch the cards just now.</p>
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
        <div role="status" aria-label="loading the card pack" className="animate-pulse space-y-4 pt-2">
          <div className="h-9 w-1/2 rounded-full bg-paper-2" />
          <div className="flex gap-2">
            <div className="h-11 w-32 rounded-pill bg-paper-2" />
            <div className="h-11 w-32 rounded-pill bg-paper-2" />
          </div>
          <div className="grid grid-cols-3 gap-4 pt-3 sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-[12px] bg-paper-2" />
            ))}
          </div>
        </div>
      </Shell>
    );
  }
  if (!pack || !variant) {
    return (
      <Shell>
        <div className="pop-in mx-auto mt-10 max-w-sm rounded-[18px] border-2 border-dashed border-cocoa/25 bg-paper p-7 text-center text-sm text-ink-soft">
          That product isn’t available. <Link href="/start-creating" className="font-bold text-cinnamon underline">back to the range</Link>.
        </div>
      </Shell>
    );
  }

  const perCard = packSize > 0 && variant.pricePence % packSize === 0 ? variant.pricePence / packSize : null;
  const sheetDrawing = chosen ? drawingFor(chosen) : null;

  return (
    <Shell>
      <div className="md:grid md:grid-cols-[1fr_18rem] md:items-start md:gap-8">
        <div>
          <h1 className="font-display text-3xl font-extrabold text-cocoa">card pack</h1>
          <p className="mt-1 text-sm text-ink-soft">{pack.blurb ?? 'a stack of little masterpieces, ready to send'}</p>

          {/* Pack size */}
          <div className="mt-5">
            <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">How many cards</p>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="pack size">
              {sizes.map(({ v, n }) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setVariantId(v.id)}
                  aria-pressed={v.id === variant.id}
                  className={`${OPT} ${v.id === variant.id ? OPT_ON : OPT_OFF}`}
                >
                  pack of {n} · {gbp(v.pricePence)}
                </button>
              ))}
            </div>
            {perCard ? <p className="mt-1.5 text-xs text-ink-faint">that’s {gbp(perCard)} a card, 7×5″ on thick Fedrigoni card</p> : null}
          </div>

          {/* The pack's base colour — the same picker + copy as every edge-to-edge product. */}
          <BaseColourPicker title="background colour" noun="card front" value={ground} onChange={setGround} />

          <CaveatNote className="mt-4 text-xl">blank inside, for your own words ✎</CaveatNote>

          {/* The fronts */}
          <div className="mt-5 flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">Your {packSize} cards</h2>
            <span className="text-xs font-bold text-ink-soft" aria-live="polite">
              {filled} of {packSize} chosen
            </span>
          </div>
          <ol className="mt-4 grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-5" aria-label="the fronts of your cards">
            {cards.map((c, i) => {
              const d = c ? drawingFor(c.assetId) : null;
              const q = c ? assess(c) : null;
              const badge = !q ? null : q.decision === 'BLOCK' ? 'too small to print' : q.softUpClose ? 'a little soft up close' : 'print-ready';
              return (
                <li key={i} className="relative">
                  {c ? (
                    <div className="polaroid tape !p-1.5" style={{ ['--tilt' as string]: i % 2 ? '1.4deg' : '-1.6deg', ['--tape' as string]: TAPES[i % TAPES.length], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg' }}>
                      <div className="relative aspect-square w-full overflow-hidden bg-paper-2">
                        {card?.variants[0] ? (
                          <MockupPreview productKey="card" assetId={c.assetId} variantId={card.variants[0].id} transform={c.transform} sourceObjectId={c.sourceObjectId ?? null} ground={groundOrNone} size="thumb" px={160} lazy />
                        ) : d?.imageUrl ? (
                          <img src={d.imageUrl} alt="" className="h-full w-full object-contain" />
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openSheet(i, false)}
                          aria-label={`card ${i + 1}: ${d?.label ?? 'a drawing'}${badge ? `, ${badge}` : ''} — swap it`}
                          className="absolute inset-0 focus-visible:outline-2"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => emptyCard(i)}
                        aria-label={`clear card ${i + 1}`}
                        className="press absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa before:absolute before:-inset-[9px] before:content-[''] hover:text-cinnamon"
                      >
                        <Icon icon={IconX} size={13} />
                      </button>
                      <p
                        className={`mt-1.5 flex items-center gap-1 text-[10px] font-extrabold leading-tight ${q?.decision === 'BLOCK' ? 'text-cinnamon' : q?.softUpClose ? 'text-ink-soft' : 'text-green-save'}`}
                        aria-hidden
                      >
                        {badge ? <Icon icon={q?.decision === 'BLOCK' ? IconAlertTriangle : IconCircleCheck} size={12} /> : null}
                        {badge ?? `card ${i + 1}`}
                      </p>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openSheet(i, true)}
                      aria-label={`pick a drawing for card ${i + 1}`}
                      className="press flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-cocoa/30 bg-paper/60 text-cinnamon hover:border-cocoa"
                    >
                      <Icon icon={IconPlus} size={20} />
                      <span className="text-[11px] font-extrabold">card {i + 1}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* Summary + the primary action: a thumb-zone dock on phones, a side card from md. */}
        <div className="md:sticky md:top-24">
          <div className="mt-6 hidden rounded-[18px] border-2 border-cocoa bg-paper p-4 shadow-[0_3px_0_var(--color-cocoa)] md:mt-0 md:block">
            <p className="flex items-center gap-2 font-display text-lg font-extrabold text-cocoa">
              <Icon icon={IconCards} size={20} className="text-cinnamon" /> pack of {packSize}
            </p>
            <p className="mt-1 text-sm text-ink-soft">a drawing on every front, the same one or all different — blank inside.</p>
            <p className="mt-3 text-2xl font-extrabold text-cocoa">{gbp(variant.pricePence)}</p>
          </div>
          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-4 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none">
            {blockedAt >= 0 ? (
              <p role="status" className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold text-cocoa">
                <Icon icon={IconAlertTriangle} size={15} className="mt-px shrink-0 text-cinnamon" />
                card {blockedAt + 1}’s drawing is too small to print on a card — tap it to swap.
              </p>
            ) : null}
            {complete ? (
              <Button size="lg" className="w-full whitespace-nowrap" onClick={addToBasket} disabled={blockedAt >= 0}>
                <Icon icon={IconShoppingBag} size={16} /> {edit ? 'update basket' : 'add to basket'} · {gbp(variant.pricePence)}
              </Button>
            ) : (
              <Button size="lg" className="w-full whitespace-nowrap" onClick={() => openSheet(firstEmpty(cards), true)}>
                <Icon icon={IconPlus} size={16} /> pick {packSize - filled} more drawing{packSize - filled === 1 ? '' : 's'}
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
        title={sheet ? `pick a drawing for card ${sheet.slot + 1}` : 'pick a drawing'}
        subtitle="from your keepsake box"
        footer={
          drawings.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="md" className="flex-1 !px-3" onClick={fillAll} disabled={!sheetDrawing?.printable}>
                use it on all {packSize}
              </Button>
              <Button size="md" className="flex-1 !px-3" onClick={putOnCard} disabled={!sheetDrawing?.printable}>
                put it on card {(sheet?.slot ?? 0) + 1}
              </Button>
            </div>
          ) : null
        }
      >
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
        <PickerBody picker={picker} drawings={drawings} chosen={chosen} onChoose={setChosen} onRetry={loadPicker} />
      </Modal>
    </Shell>
  );
}

/** The sheet's body: loading skeleton · error · empty keepsake box · the drawings to choose from.
 * Shared with the calendar builder (`next` = where log-in returns to, `forWhat` = the empty-box copy). */
export function PickerBody({
  picker,
  drawings,
  chosen,
  onChoose,
  onRetry,
  next = '/customize/cardPack',
  forWhat = 'a card',
}: {
  picker: PickerState;
  drawings: Drawing[];
  chosen: string | null;
  onChoose: (assetId: string) => void;
  onRetry: () => void;
  next?: string;
  forWhat?: string;
}) {
  const signedIn = picker.status === 'ready' && picker.signedIn;
  const login = (
    <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-bold text-cinnamon underline-offset-2 hover:underline">
      log in
    </Link>
  );
  if (picker.status === 'loading' && drawings.length === 0) {
    return <TileSkeletonGrid count={6} label="opening your keepsake box" className="grid grid-cols-3 gap-3 pb-3 pt-4 sm:grid-cols-4" />;
  }
  if (picker.status === 'error' && drawings.length === 0) {
    return (
      <div role="alert" className="py-8 text-center text-sm text-ink-soft">
        <p className="font-semibold text-cocoa">we couldn’t open your keepsake box just now.</p>
        <Button variant="secondary" size="md" className="mt-4" onClick={onRetry}>
          try again
        </Button>
      </div>
    );
  }
  if (drawings.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-cocoa/30 text-ink-soft" aria-hidden>
          <Icon icon={IconCards} size={24} />
        </span>
        <p className="mt-3 max-w-xs text-sm text-ink-soft">
          {signedIn ? (
            <>your keepsake box is empty for now — keep a drawing and it’ll be here, ready for {forWhat}.</>
          ) : (
            <>{login} to pick from your keepsake box — or start with a drawing.</>
          )}
        </p>
        <Button href="/start-creating" variant="secondary" size="md" className="mt-4">
          upload a drawing
        </Button>
      </div>
    );
  }
  return (
    <div className="pb-3">
      <ul className="grid grid-cols-3 gap-3 pt-2 sm:grid-cols-4">
        {drawings.map((d) => {
          const on = chosen === d.assetId;
          return (
            <li key={d.assetId}>
              <button
                type="button"
                onClick={() => onChoose(d.assetId)}
                disabled={!d.printable}
                aria-pressed={on}
                aria-label={d.printable ? d.label : `${d.label} — not quite ready to print`}
                className={`press relative w-full rounded-[14px] border-2 bg-paper p-1.5 text-left disabled:opacity-60 ${on ? 'border-cocoa shadow-[0_3px_0_var(--color-cocoa)]' : 'border-cocoa/15 hover:border-cocoa/50'}`}
              >
                <span className="block aspect-square w-full overflow-hidden rounded-[10px] bg-paper-2">
                  {d.imageUrl ? <img src={d.imageUrl} alt="" className="h-full w-full object-contain" /> : null}
                </span>
                <span className="mt-1 block truncate text-[11px] font-bold text-cocoa">{d.label}</span>
                {!d.printable ? <span className="block text-[10px] text-ink-faint">not quite ready to print</span> : null}
                {on ? (
                  <span aria-hidden className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-paper bg-cocoa text-paper">
                    <Icon icon={IconCircleCheck} size={14} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {picker.status === 'ready' && !picker.signedIn ? (
        <p className="mt-3 text-center text-xs text-ink-soft">{login} to pick from your keepsake box too.</p>
      ) : null}
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
      <FlowHeader back={{ href: '/start-creating', label: 'Back to your range' }} />
      {/* pb-36 on phones clears the fixed thumb-zone action dock. */}
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-4 pb-40 pt-6 md:px-6 md:pb-10">{children}</main>
    </div>
  );
}
