'use client';

import { IconAlertTriangle, IconChevronLeft, IconChevronRight, IconCircleCheck, IconMinus, IconPlus, IconShoppingBag, IconX } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { FlowHeader } from './FlowHeader';
import { ChristmasPromise } from './ChristmasPromise';
import { MockupPreview } from './MockupPreview';
import type { ProductKey } from './ProductArt';
import { PickerBody, type Drawing, type PickerState } from './CardPackBuilder';
import { forgetResumeVisit, isResumeVisit, usePickerEdits } from './usePickerEdits';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { checkBundleAction } from '@/app/actions/bundle';
import { keepsakePickerAction } from '@/app/actions/keepsakePicker';
import type { CatalogueProduct } from '@/server/catalogue';
import { canvasSizePx, clampTransform, computeLayerRect, type ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import {
  BUNDLE_ADDON_PENCE, BUNDLE_BASE, BUNDLE_BASE_PENCE, BUNDLE_KEY, BUNDLE_MAX_EACH, BUNDLE_PIECE_GEOM, COASTER_STEP,
  bundlePricePence, bundleSummary, tablePieces, type BundleArt, type BundlePiece, type BundleSpec,
} from '@/lib/christmas-bundle';
import { christmasBundleLine, newBundleLineId } from '@/lib/christmas-bundle-line';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { gbp, shownSrc, toast, useBasket, useUpload } from '@/lib/store';

/**
 * The CHRISTMAS FAMILY BUNDLE builder (founder, 27 Oct — go-to-market C25 + C26):
 *  (1) the table drawing — on all 4 placemats + 6 coasters;
 *  (2) ornaments + sacks, each with its own drawing (from the keepsake box, or uploaded through the
 *      same picker workshop as the card packs + calendar: auto trim + straighten, remove background,
 *      edit in the Studio);
 *  (3) extra placemats (+1) and coasters (+2);
 *  (4) a flip-through of every piece with its print-quality check — the order-time gate's maths;
 *  (5) add to basket: ONE line, every drawing authz-checked server-side and priced by the server.
 * No names, no family-member step — just counts and a drawing per ornament / sack.
 *
 * Not in /mockups — extends the Scrapbook language of the calendar + card-pack builders (taped
 * polaroids, ink chips, the kraft thumb-zone dock, the bottom-sheet picker).
 */

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];
const PICKER_TTL_MS = 8 * 60_000; // signed URLs live 10 min — refresh the list before they lapse
const DRAFT_KEY = 'sd_bundle_draft'; // per tab: picks survive a trip to the Studio
const NEXT = `/customize/${BUNDLE_KEY}`;
/** The picker's slot numbers: 0 = the table, 100+i = ornament i, 200+i = sack i. */
const ORN = 100;
const SACK = 200;

type Draft = { table: BundleArt | null; ornaments: BundleArt[]; sacks: BundleArt[]; extraPlacemats: number; extraCoasters: number };
const EMPTY: Draft = { table: null, ornaments: [], sacks: [], extraPlacemats: 0, extraCoasters: 0 };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** A piece's placement: its product's default (the order gate + the print file use the same). */
export const placeOf = (piece: string) => clampTransform(defaultTransformFor(piece));

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<Draft> | null;
    if (!d || typeof d !== 'object') return null;
    const ok = (a: unknown): a is BundleArt => !!a && typeof a === 'object' && typeof (a as BundleArt).assetId === 'string';
    return {
      table: ok(d.table) ? d.table : null,
      ornaments: (Array.isArray(d.ornaments) ? d.ornaments : []).filter(ok).slice(0, BUNDLE_MAX_EACH),
      sacks: (Array.isArray(d.sacks) ? d.sacks : []).filter(ok).slice(0, BUNDLE_MAX_EACH),
      extraPlacemats: Number(d.extraPlacemats) || 0,
      extraCoasters: Number(d.extraCoasters) || 0,
    };
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

const slotName = (slot: number) => (slot < ORN ? 'the table' : slot < SACK ? `ornament ${slot - ORN + 1}` : `sack ${slot - SACK + 1}`);

/** One piece in the flip-through. */
export type Shown<P extends string = BundlePiece> = { piece: P; art: BundleArt; name: string; count: number; slot: number };

export function ChristmasBundleBuilder() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const add = useBasket((s) => s.add);
  const update = useBasket((s) => s.update);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [edit, setEdit] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ status: 'loading' });
  const [sheet, setSheet] = useState<{ slot: number; advance: boolean } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [dims, setDims] = useState<Record<string, { width: number; height: number } | null>>({});
  const [view, setView] = useState(0); // the piece on show in the flip-through
  const [adding, setAdding] = useState(false);

  // ── load: the shop catalogue (for the ornament + sack mockups) and the keepsake box ─────────
  useEffect(() => {
    loadCatalogueAction()
      .then(setProducts)
      .catch(() => setProducts([])); // the builder still works — the pieces show as sketches
  }, []);
  const loadPicker = useCallback(() => {
    setPicker({ status: 'loading' });
    keepsakePickerAction()
      .then((r) => setPicker(r.ok ? { status: 'ready', signedIn: r.signedIn, keepsakes: r.keepsakes, at: Date.now() } : { status: 'error' }))
      .catch(() => setPicker({ status: 'error' }));
  }, []);
  useEffect(loadPicker, [loadPicker]);
  const variantOf = (key: string) => products?.find((p) => p.key === key)?.variants.find((v) => v.isDefault)?.id ?? null;
  const ornamentVariant = variantOf('ceramicOrnament');
  const sackVariant = variantOf('sack');

  // Seed once: a basket line (?edit=<id>) reopens exactly that bundle; else this tab's draft (only on
  // the way back from the Studio); else the drawing in progress goes on the table.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const id = new URLSearchParams(window.location.search).get('edit');
    const line = id ? useBasket.getState().items.find((i) => i.id === id && i.bundle) : null;
    if (line?.bundle) {
      setEdit(line.id);
      setD({ ...line.bundle, ornaments: [...line.bundle.ornaments], sacks: [...line.bundle.sacks] });
      return;
    }
    const resuming = isResumeVisit();
    forgetResumeVisit();
    if (!resuming) writeDraft(null);
    const draft = resuming ? readDraft() : null;
    if (draft) {
      setD(draft);
      return;
    }
    const u = useUpload.getState().upload;
    if (u?.assetId) setD((x) => ({ ...x, table: { assetId: u.assetId!, ...(u.cutout?.sourceObjectId ? { sourceObjectId: u.cutout.sourceObjectId } : {}) } }));
  }, []);
  // Keep this tab's draft (not while editing a basket line — that line IS the saved state).
  useEffect(() => {
    if (!seededRef.current || edit) return;
    writeDraft(d.table || d.ornaments.length || d.sacks.length ? d : null);
  }, [d, edit]);

  // Every drawing on offer: the one in progress first, then the keepsake box. One entry per drawing.
  const drawingsRaw = useMemo(() => {
    const list: Drawing[] = [];
    if (upload?.assetId) list.push({ assetId: upload.assetId, imageUrl: shownSrc(upload) ?? upload.dataUrl, sourceObjectId: upload.cutout?.sourceObjectId, label: 'this drawing', printable: true });
    if (picker.status === 'ready') {
      for (const k of picker.keepsakes) {
        if (list.some((x) => x.assetId === k.id)) continue;
        const when = shortDate(k.createdAtISO);
        // the ORDER holds anything screening hasn't cleared (orders.ts, D8) — designing with it is fine
        list.push({ assetId: k.id, imageUrl: k.imageUrl, thumbUrl: k.thumbUrl ?? null, ...(k.sourceObjectId ? { sourceObjectId: k.sourceObjectId } : {}), label: k.childFirstName ? `${k.childFirstName} · ${when}` : `kept ${when}`, printable: true });
      }
    }
    return list;
  }, [upload, picker]);
  const tools = usePickerEdits({ returnTo: `${NEXT}?resume=1`, onUploaded: loadPicker, sheet, onCopied: setChosen });
  const { resume, clearResume } = tools;
  useEffect(() => {
    if (!resume) return;
    clearResume();
    setSheet(resume.sheet);
    setChosen(resume.assetId);
  }, [resume, clearResume]);
  const applyEdits = tools.apply;
  const drawings = useMemo(() => applyEdits(drawingsRaw), [applyEdits, drawingsRaw]);
  // a drawing edited here (remove background, the Studio) → every piece already showing it shows the edit
  useEffect(() => {
    const fix = (a: BundleArt | null): BundleArt | null => {
      if (!a) return a;
      const sid = drawings.find((x) => x.assetId === a.assetId)?.sourceObjectId;
      if ((sid ?? null) === (a.sourceObjectId ?? null)) return a;
      return sid ? { assetId: a.assetId, sourceObjectId: sid } : { assetId: a.assetId };
    };
    setD((old) => {
      const next = { ...old, table: fix(old.table), ornaments: old.ornaments.map((a) => fix(a)!), sacks: old.sacks.map((a) => fix(a)!) };
      const same = next.table === old.table && next.ornaments.every((a, i) => a === old.ornaments[i]) && next.sacks.every((a, i) => a === old.sacks[i]);
      return same ? old : next;
    });
  }, [drawings]);
  const drawingFor = useCallback((assetId: string) => drawings.find((x) => x.assetId === assetId) ?? null, [drawings]);

  // ── what's being made ─────────────────────────────────────────────────────────────────────
  const { placemats, coasters } = tablePieces(d);
  const shown: Shown[] = useMemo(() => {
    const out: Shown[] = [];
    if (d.table) {
      out.push({ piece: 'placemat', art: d.table, name: 'the placemats', count: placemats, slot: 0 });
      out.push({ piece: 'coaster', art: d.table, name: 'the coasters', count: coasters, slot: 0 });
    }
    d.ornaments.forEach((a, i) => out.push({ piece: 'ceramicOrnament', art: a, name: `ornament ${i + 1}`, count: 1, slot: ORN + i }));
    d.sacks.forEach((a, i) => out.push({ piece: 'sack', art: a, name: `sack ${i + 1}`, count: 1, slot: SACK + i }));
    return out;
  }, [d, placemats, coasters]);
  useEffect(() => {
    if (view > 0 && view >= shown.length) setView(Math.max(0, shown.length - 1));
  }, [view, shown.length]);

  // The pixel size of each drawing — fed to the SAME assessment the order-time gate runs, per piece.
  useEffect(() => {
    const started = new Set<string>();
    for (const s of shown) {
      const x = drawingFor(s.art.assetId);
      const key = `${s.art.assetId}:${s.art.sourceObjectId ?? ''}`;
      if (!x?.imageUrl || key in dims || started.has(key)) continue;
      started.add(key);
      if (x.px) {
        const px = x.px;
        setDims((m) => ({ ...m, [key]: { width: px.width, height: px.height } })); // a Studio design: its drawing's real pixels
        continue;
      }
      setDims((m) => ({ ...m, [key]: null }));
      const img = new window.Image();
      img.onload = () => setDims((m) => ({ ...m, [key]: img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null }));
      img.src = x.imageUrl;
    }
  }, [shown, drawingFor, dims]);
  const dimsOf = useCallback((a: BundleArt) => dims[`${a.assetId}:${a.sourceObjectId ?? ''}`] ?? null, [dims]);
  const assess = (s: Pick<Shown, 'piece' | 'art'>): ResolutionAssessment | null => {
    const src = dimsOf(s.art);
    return src ? assessPrintResolution(BUNDLE_PIECE_GEOM[s.piece], src, placeOf(s.piece), s.piece) : null;
  };
  const blocked = shown.find((s) => assess(s)?.decision === 'BLOCK') ?? null;

  const price = bundlePricePence({ ornaments: d.ornaments.length, sacks: d.sacks.length, extraPlacemats: d.extraPlacemats, extraCoasters: d.extraCoasters });

  // ── picking ────────────────────────────────────────────────────────────────────────────────
  const openSheet = (slot: number) => {
    if (picker.status === 'ready' && Date.now() - picker.at > PICKER_TTL_MS) loadPicker();
    const cur = slot === 0 ? d.table : slot < SACK ? d.ornaments[slot - ORN] : d.sacks[slot - SACK];
    setChosen(cur?.assetId ?? null);
    setSheet({ slot, advance: !cur });
  };
  const putIt = () => {
    if (!sheet || !chosen) return;
    const x = drawingFor(chosen);
    if (!x) return;
    const a: BundleArt = { assetId: x.assetId, ...(x.sourceObjectId ? { sourceObjectId: x.sourceObjectId } : {}) };
    const { slot } = sheet;
    setD((old) => {
      if (slot === 0) return { ...old, table: a };
      const key = slot < SACK ? 'ornaments' : 'sacks';
      const i = slot - (slot < SACK ? ORN : SACK);
      const list = [...old[key]];
      if (i < list.length) list[i] = a;
      else if (list.length < BUNDLE_MAX_EACH) list.push(a);
      return { ...old, [key]: list };
    });
    // show the piece just filled in the flip-through
    const at = slot === 0 ? 0 : (d.table ? 2 : 0) + (slot < SACK ? slot - ORN : d.ornaments.length + (slot - SACK));
    setView(at);
    setSheet(null);
    toast(`${slotName(slot)} ✓`);
  };
  const removeAt = (key: 'ornaments' | 'sacks', i: number) => setD((old) => ({ ...old, [key]: old[key].filter((_, j) => j !== i) }));

  // ── basket ─────────────────────────────────────────────────────────────────────────────────
  const ready = !!d.table;
  const addToBasket = async () => {
    if (!d.table || blocked || adding) return;
    const spec: BundleSpec = { table: d.table, ornaments: d.ornaments, sacks: d.sacks, extraPlacemats: d.extraPlacemats, extraCoasters: d.extraCoasters };
    setAdding(true);
    try {
      // every drawing is checked server-side (may this buyer use it?) and the server prices it
      const res = await checkBundleAction(spec);
      if (!res.ok) {
        toast(res.reason === 'not-allowed' ? 'one of those drawings isn’t yours to use — swap it for another' : 'we couldn’t add it just now — please try again');
        return;
      }
      const line = christmasBundleLine({ id: edit ?? newBundleLineId(), bundle: spec, pricePence: res.pricePence, previewVariantId: ornamentVariant ?? undefined });
      if (edit) {
        const { id, ...fields } = line;
        update(edit, fields, id);
        toast('basket updated ✓');
      } else {
        add(line);
        toast('added to basket ✓');
      }
      writeDraft(null);
      router.push('/start-creating');
    } finally {
      setAdding(false);
    }
  };

  const sheetDrawing = chosen ? drawingFor(chosen) : null;
  const tile = (a: BundleArt) => {
    const x = drawingFor(a.assetId);
    return x?.thumbUrl ?? x?.imageUrl ?? null;
  };
  const badgeOf = (q: ResolutionAssessment | null) => (!q ? null : q.decision === 'BLOCK' ? 'too small to print' : q.softUpClose ? 'a little soft up close' : 'print-ready');

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start lg:gap-12">
        {/* Left: flip through every piece, with its print-quality check */}
        <div className="min-w-0 md:sticky md:top-20">
          <BundleFlip
            shown={shown}
            view={view}
            onView={setView}
            render={(s) => (
              <PiecePreview
                s={s}
                imageUrl={drawingFor(s.art.assetId)?.imageUrl ?? null}
                src={dimsOf(s.art)}
                variantId={s.piece === 'ceramicOrnament' ? ornamentVariant : s.piece === 'sack' ? sackVariant : null}
              />
            )}
            badge={(s) => {
              const q = assess(s);
              return { text: badgeOf(q), block: q?.decision === 'BLOCK', soft: !!q?.softUpClose };
            }}
            onEmpty={() => openSheet(0)}
          />
        </div>

        {/* Right: title → the three steps → what it adds up to → add to basket (bottom-right) */}
        <div className="flex flex-col">
          <h1 className="font-display text-[32px] leading-tight text-cocoa md:text-4xl">christmas family bundle</h1>
          <p className="mt-1 text-sm text-ink-soft">the whole family’s christmas in one parcel — their drawings on the table, on the tree and under it.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="sticker inline-flex rotate-[-2deg] rounded-[12px] bg-honey px-3 py-1 font-display text-2xl text-cocoa" aria-live="polite">
              {gbp(price)}
            </span>
            <span className="text-xs font-semibold text-green-save">free tracked delivery · one parcel</span>
            <ChristmasPromise productKey={BUNDLE_KEY} />
          </div>

          {/* 1 · the table */}
          <Step n={1} title="the table" note={`one drawing on all ${BUNDLE_BASE.placemats} placemats + ${BUNDLE_BASE.coasters} coasters · ${gbp(BUNDLE_BASE_PENCE)}`}>
            {d.table ? (
              <div className="flex items-center gap-3">
                <Polaroid url={tile(d.table)} i={0} label={`the table drawing: ${drawingFor(d.table.assetId)?.label ?? 'a drawing'} — swap it`} onClick={() => openSheet(0)} />
                <Button variant="secondary" size="md" onClick={() => openSheet(0)}>
                  swap the table drawing
                </Button>
              </div>
            ) : (
              <AddTile label="pick the table drawing" sub="from your keepsake box, or upload one" onClick={() => openSheet(0)} wide />
            )}
          </Step>

          {/* 2 · ornaments + sacks, a drawing each */}
          <Step n={2} title="ornaments & sacks" note="one for everyone — each with its own drawing">
            <SlotRow
              label="ceramic ornaments"
              each={BUNDLE_ADDON_PENCE.ornament}
              list={d.ornaments}
              tile={tile}
              nameOf={(i) => `ornament ${i + 1}`}
              assess={(a) => badgeOf(assess({ piece: 'ceramicOrnament', art: a }))}
              blockedOf={(a) => assess({ piece: 'ceramicOrnament', art: a })?.decision === 'BLOCK'}
              onOpen={(i) => openSheet(ORN + i)}
              onRemove={(i) => removeAt('ornaments', i)}
              addLabel="add an ornament"
            />
            <SlotRow
              label="christmas sacks"
              each={BUNDLE_ADDON_PENCE.sack}
              list={d.sacks}
              tile={tile}
              nameOf={(i) => `sack ${i + 1}`}
              assess={(a) => badgeOf(assess({ piece: 'sack', art: a }))}
              blockedOf={(a) => assess({ piece: 'sack', art: a })?.decision === 'BLOCK'}
              onOpen={(i) => openSheet(SACK + i)}
              onRemove={(i) => removeAt('sacks', i)}
              addLabel="add a sack"
            />
          </Step>

          {/* 3 · more for the table */}
          <Step n={3} title="more for the table" note="the table drawing again — for a bigger table">
            <Stepper
              label="extra placemats"
              sub={`+${gbp(BUNDLE_ADDON_PENCE.placemat)} each`}
              value={d.extraPlacemats}
              step={1}
              onChange={(v) => setD((x) => ({ ...x, extraPlacemats: v }))}
            />
            <Stepper
              label="extra coasters"
              sub={`+${gbp(BUNDLE_ADDON_PENCE.coasterPair)} a pair`}
              value={d.extraCoasters}
              step={COASTER_STEP}
              onChange={(v) => setD((x) => ({ ...x, extraCoasters: v }))}
            />
          </Step>

          {/* What it adds up to — every line, no surprises */}
          <section aria-label="what’s in your bundle" className="mt-6 rounded-[16px] border-2 border-cocoa/15 bg-paper p-4">
            <ul className="space-y-1.5 text-sm text-cocoa">
              <Row label={`the table · ${BUNDLE_BASE.placemats} placemats + ${BUNDLE_BASE.coasters} coasters`} pence={BUNDLE_BASE_PENCE} />
              {d.ornaments.length ? <Row label={`${d.ornaments.length} ornament${d.ornaments.length === 1 ? '' : 's'} × ${gbp(BUNDLE_ADDON_PENCE.ornament)}`} pence={d.ornaments.length * BUNDLE_ADDON_PENCE.ornament} /> : null}
              {d.sacks.length ? <Row label={`${d.sacks.length} sack${d.sacks.length === 1 ? '' : 's'} × ${gbp(BUNDLE_ADDON_PENCE.sack)}`} pence={d.sacks.length * BUNDLE_ADDON_PENCE.sack} /> : null}
              {d.extraPlacemats ? <Row label={`${d.extraPlacemats} more placemat${d.extraPlacemats === 1 ? '' : 's'}`} pence={d.extraPlacemats * BUNDLE_ADDON_PENCE.placemat} /> : null}
              {d.extraCoasters ? <Row label={`${d.extraCoasters} more coasters`} pence={(d.extraCoasters / COASTER_STEP) * BUNDLE_ADDON_PENCE.coasterPair} /> : null}
            </ul>
            <p className="mt-2 flex justify-between border-t-2 border-dashed border-cocoa/15 pt-2 text-sm font-extrabold text-cocoa">
              <span>{bundleSummary({ ornaments: d.ornaments.length, sacks: d.sacks.length, extraPlacemats: d.extraPlacemats, extraCoasters: d.extraCoasters })}</span>
              <span>{gbp(price)}</span>
            </p>
            <CaveatNote className="mt-2 text-lg">no names, just their drawings — they’re only little once ✶</CaveatNote>
          </section>

          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none md:flex md:flex-col md:items-end">
            {blocked ? (
              <p role="status" className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold text-cocoa">
                <Icon icon={IconAlertTriangle} size={15} className="mt-px shrink-0 text-cinnamon" />
                the drawing on {blocked.name} is too small to print well — tap it to swap it for another.
              </p>
            ) : null}
            {ready ? (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => void addToBasket()} disabled={!!blocked || adding}>
                <Icon icon={IconShoppingBag} size={16} /> {adding ? 'checking your drawings…' : edit ? 'update basket' : 'add to basket'} · {gbp(price)}
              </Button>
            ) : (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => openSheet(0)}>
                <Icon icon={IconPlus} size={16} /> pick the table drawing
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
        title={sheet ? `pick a drawing for ${slotName(sheet.slot)}` : 'pick a drawing'}
        subtitle="from your keepsake box"
        footer={
          drawings.length > 0 ? (
            <Button size="md" className="w-full" onClick={putIt} disabled={!sheetDrawing?.printable}>
              {sheet && sheet.slot === 0 ? 'put it on the table' : `use it for ${sheet ? slotName(sheet.slot) : 'this one'}`}
            </Button>
          ) : null
        }
      >
        <PickerBody picker={picker} drawings={drawings} chosen={chosen} onChoose={setChosen} onRetry={loadPicker} next={NEXT} forWhat="your christmas bundle" tools={tools} />
      </Modal>
    </Shell>
  );
}

// ── pieces ─────────────────────────────────────────────────────────────────────────────────────

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-oat">
      <FlowHeader back={{ href: '/start-creating', label: 'Back to your collection' }} />
      {/* pb-40 on phones clears the fixed thumb-zone action dock. */}
      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 pb-40 pt-6 md:px-6 md:pb-10 2xl:max-w-[1600px]">
        {children}
      </main>
    </div>
  );
}

export function Step({ n, title, note, children }: { n: number; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="mt-6" aria-labelledby={`bundle-step-${n}`}>
      <h2 id={`bundle-step-${n}`} className="flex items-baseline gap-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-cocoa bg-honey text-[12px] text-cocoa">{n}</span>
        {title}
      </h2>
      <p className="mt-1 text-xs text-ink-soft">{note}</p>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

export function Polaroid({ url, i, label, onClick, blocked }: { url: string | null; i: number; label: string; onClick: () => void; blocked?: boolean }) {
  return (
    <div
      className="polaroid tape relative w-24 shrink-0 !p-1.5"
      style={{ ['--tilt' as string]: i % 2 ? '1.2deg' : '-1.4deg', ['--tape' as string]: TAPES[i % TAPES.length], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg' }}
    >
      <div className={`relative aspect-square w-full overflow-hidden bg-white ${blocked ? 'ring-2 ring-cinnamon' : ''}`}>
        {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-contain" /> : <span className="flex h-full items-center justify-center text-[10px] font-bold text-ink-faint">a drawing</span>}
        <button type="button" onClick={onClick} aria-label={label} className="absolute inset-0 focus-visible:outline-2" />
      </div>
    </div>
  );
}

export function AddTile({ label, sub, onClick, wide, disabled }: { label: string; sub?: string; onClick: () => void; wide?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`press flex min-h-11 flex-col items-center justify-center gap-1 rounded-[12px] border-2 border-dashed border-cocoa/30 bg-paper/60 px-3 py-3 text-cinnamon hover:border-cocoa disabled:opacity-40 ${wide ? 'w-full' : 'aspect-square w-24'}`}
    >
      <Icon icon={IconPlus} size={18} />
      <span className="text-[12px] font-extrabold lowercase leading-tight">{label}</span>
      {sub ? <span className="text-[11px] font-semibold text-ink-soft">{sub}</span> : null}
    </button>
  );
}

function SlotRow({
  label, each, list, tile, nameOf, assess, blockedOf, onOpen, onRemove, addLabel,
}: {
  label: string;
  each: number;
  list: BundleArt[];
  tile: (a: BundleArt) => string | null;
  nameOf: (i: number) => string;
  assess: (a: BundleArt) => string | null;
  blockedOf: (a: BundleArt) => boolean;
  onOpen: (i: number) => void;
  onRemove: (i: number) => void;
  addLabel: string;
}) {
  const full = list.length >= BUNDLE_MAX_EACH;
  return (
    <div>
      <p className="flex items-baseline justify-between text-sm font-extrabold lowercase text-cocoa">
        <span>{label}</span>
        <span className="text-xs font-bold text-ink-soft" aria-live="polite">
          {list.length} · +{gbp(each)} each
        </span>
      </p>
      <ol className="mt-2 flex flex-wrap gap-x-3 gap-y-4" aria-label={label}>
        {list.map((a, i) => {
          const badge = assess(a);
          const bad = blockedOf(a);
          return (
            <li key={i} className="relative">
              <Polaroid url={tile(a)} i={i + 1} blocked={bad} label={`${nameOf(i)}${badge ? `, ${badge}` : ''} — swap its drawing`} onClick={() => onOpen(i)} />
              <button
                type="button"
                onClick={() => onRemove(i)}
                aria-label={`remove ${nameOf(i)}`}
                className="press absolute -right-2 -top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa before:absolute before:-inset-[9px] before:content-[''] hover:text-cinnamon"
              >
                <Icon icon={IconX} size={13} />
              </button>
              <p className={`mt-1 flex items-center gap-1 text-[10px] font-extrabold leading-tight ${bad ? 'text-cinnamon' : 'text-green-save'}`} aria-hidden>
                {badge ? <Icon icon={bad ? IconAlertTriangle : IconCircleCheck} size={12} /> : null}
                {badge ?? nameOf(i)}
              </p>
            </li>
          );
        })}
        <li>
          <AddTile label={full ? `that’s ${BUNDLE_MAX_EACH} — the most` : addLabel} sub={full ? undefined : `+${gbp(each)}`} onClick={() => onOpen(list.length)} disabled={full} />
        </li>
      </ol>
    </div>
  );
}

function Stepper({ label, sub, value, step, onChange }: { label: string; sub: string; value: number; step: number; onChange: (v: number) => void }) {
  const set = (v: number) => onChange(Math.max(0, Math.min(BUNDLE_MAX_EACH, v)));
  return (
    <div className="flex items-center justify-between gap-3" role="group" aria-label={label}>
      <div>
        <p className="text-sm font-extrabold lowercase text-cocoa">{label}</p>
        <p className="text-xs text-ink-soft">{sub}</p>
      </div>
      <div className="flex items-center rounded-pill border-2 border-cocoa bg-paper shadow-[0_2px_0_var(--color-cocoa)]">
        <button type="button" onClick={() => set(value - step)} disabled={value <= 0} aria-label={`${step === 1 ? 'one' : step} fewer ${label}`} className="press flex h-11 w-11 items-center justify-center text-cocoa disabled:opacity-35">
          <Icon icon={IconMinus} size={16} />
        </button>
        <span className="min-w-8 text-center font-display text-lg text-cocoa" aria-live="polite" aria-label={`${value} ${label}`}>
          {value}
        </span>
        <button type="button" onClick={() => set(value + step)} disabled={value + step > BUNDLE_MAX_EACH} aria-label={`${step === 1 ? 'one' : step} more ${label}`} className="press flex h-11 w-11 items-center justify-center text-cinnamon disabled:opacity-35">
          <Icon icon={IconPlus} size={16} />
        </button>
      </div>
    </div>
  );
}

export function Row({ label, pence }: { label: string; pence: number }) {
  return (
    <li className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-bold">{gbp(pence)}</span>
    </li>
  );
}

/**
 * The FLIP-THROUGH: the placemats, the coasters, then every ornament and sack — one at a time, with
 * the print-quality badge the order-time gate would give it. ← / → or a swipe turns it.
 */
export function BundleFlip<S extends Shown<string>>({
  shown, view, onView, render, badge, onEmpty, emptyLabel = 'pick a drawing for the table to see it here',
}: {
  shown: S[];
  view: number;
  onView: (i: number) => void;
  render: (s: S) => React.ReactNode;
  badge: (s: S) => { text: string | null; block: boolean; soft: boolean };
  onEmpty: () => void;
  /** What the empty state says (nothing picked yet). */
  emptyLabel?: string;
}) {
  const swipe = useRef<number | null>(null);
  const go = (i: number) => onView(Math.max(0, Math.min(shown.length - 1, i)));
  const s = shown[view] ?? null;
  if (!s) {
    return (
      <button
        type="button"
        onClick={onEmpty}
        className="press mx-auto flex aspect-[3425/2421] w-full max-w-md flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-cocoa/30 bg-paper/60 text-sm font-bold text-ink-soft hover:border-cocoa"
      >
        <Icon icon={IconPlus} size={22} className="text-cinnamon" />
        {emptyLabel}
      </button>
    );
  }
  const b = badge(s);
  return (
    <section aria-label="flip through your bundle" aria-roledescription="carousel" className="select-none">
      <div
        className="relative mx-auto max-w-md touch-pan-y"
        tabIndex={0}
        aria-label={`${s.name}, ${view + 1} of ${shown.length} — use the arrow keys to flip through`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') go(view + 1);
          else if (e.key === 'ArrowLeft') go(view - 1);
          else return;
          e.preventDefault();
        }}
        onPointerDown={(e) => {
          swipe.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (swipe.current === null) return;
          const dx = e.clientX - swipe.current;
          swipe.current = null;
          if (Math.abs(dx) > 40) go(view + (dx < 0 ? 1 : -1));
        }}
      >
        <div key={view} className="pop-in polaroid !p-3" style={{ ['--tilt' as string]: view % 2 ? '0.6deg' : '-0.6deg', ['--pop-rot' as string]: '0deg' }}>
          {render(s)}
          <p className={`mt-2 flex items-center justify-center gap-1 text-[12px] font-extrabold ${b.block ? 'text-cinnamon' : b.soft ? 'text-ink-soft' : 'text-green-save'}`}>
            {b.text ? <Icon icon={b.block ? IconAlertTriangle : IconCircleCheck} size={14} /> : null}
            {b.text ?? 'checking the print quality…'}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button type="button" onClick={() => go(view - 1)} disabled={view === 0} aria-label="previous piece" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)] disabled:opacity-40">
          <Icon icon={IconChevronLeft} size={18} />
        </button>
        <p className="min-w-36 text-center text-sm font-extrabold lowercase text-cocoa" aria-live="polite">
          {s.name}
          {s.count > 1 ? ` · ×${s.count}` : ''}
          <span className="block text-[11px] font-bold text-ink-faint">
            {view + 1} of {shown.length}
          </span>
        </p>
        <button type="button" onClick={() => go(view + 1)} disabled={view >= shown.length - 1} aria-label="next piece" className="press flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-paper text-cocoa shadow-[0_2px_0_var(--color-cocoa)] disabled:opacity-40">
          <Icon icon={IconChevronRight} size={18} />
        </button>
      </div>
    </section>
  );
}

/** The shape of each piece's sketch (placemats + coasters have no product photo yet). */
const SKETCH: Record<string, string> = {
  placemat: 'rounded-[4%]',
  coaster: 'rounded-[9%]',
  ceramicOrnament: 'rounded-full',
  sack: 'rounded-[3%]',
};

/**
 * One piece as it prints. The ornament + sack show their real product mockup; the placemats + coasters
 * a clean SKETCH — the print area, cork-edged, with the drawing laid out by the SAME geometry the print
 * file uses (computeLayerRect at the piece's default placement).
 * TODO(founder samples): swap the placemat + coaster sketches for mockups once the sample photos are in
 * (scripts/compose-founder-layers.mjs → seedMockups.ts), as the sack's were.
 */
export function PiecePreview({
  s, imageUrl, src, variantId, geom = BUNDLE_PIECE_GEOM[s.piece as BundlePiece],
}: {
  s: Shown<string>;
  imageUrl: string | null;
  src: { width: number; height: number } | null;
  /** The piece's variant, when it has a real product mockup (the ornament, the sack, the mug). */
  variantId: string | null;
  /** Its print area (default: the family bundle's table of geometry). */
  geom?: { printWidthPx: number; printHeightPx: number; bleedMm: number; requiredDpi: number };
}) {
  const place = placeOf(s.piece);
  if (variantId && s.piece !== 'placemat' && s.piece !== 'coaster') {
    return (
      <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-[10px] bg-paper-2">
        <MockupPreview
          productKey={s.piece as ProductKey}
          assetId={s.art.assetId}
          variantId={variantId}
          transform={place}
          sourceObjectId={s.art.sourceObjectId ?? null}
          size="zoom"
          px={384}
          instant={imageUrl && src ? { src: imageUrl, aspect: src.width / src.height } : null}
        />
      </div>
    );
  }
  const canvas = canvasSizePx(geom);
  const rect = src ? computeLayerRect(geom, src, place) : null;
  const box = s.piece === 'sack' ? 'max-w-[60%]' : s.piece === 'placemat' ? 'max-w-full' : 'max-w-[70%]';
  return (
    <div className={`mx-auto ${box}`}>
      <div className={`relative w-full overflow-hidden border-[6px] border-line bg-white ${SKETCH[s.piece] ?? 'rounded-[4%]'}`} style={{ aspectRatio: `${canvas.width} / ${canvas.height}` }}>
        {imageUrl && rect ? (
          <img
            src={imageUrl}
            alt={`your drawing on ${s.name}`}
            className="absolute max-w-none"
            style={{
              left: `${(rect.x / canvas.width) * 100}%`,
              top: `${(rect.y / canvas.height) * 100}%`,
              width: `${(rect.width / canvas.width) * 100}%`,
              height: `${(rect.height / canvas.height) * 100}%`,
            }}
          />
        ) : imageUrl ? (
          <img src={imageUrl} alt={`your drawing on ${s.name}`} className={`h-full w-full ${place.scale ? 'object-cover' : 'object-contain'}`} />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-paper-2 text-xs font-bold text-ink-faint">your drawing</div>
        )}
      </div>
      {s.piece === 'placemat' || s.piece === 'coaster' ? (
        <p className="mt-1.5 text-center text-[11px] font-semibold text-ink-faint">a sketch of {s.piece === 'placemat' ? 'a placemat' : 'a coaster'} — photos of the real thing soon</p>
      ) : null}
    </div>
  );
}
