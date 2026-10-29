'use client';

import { IconAlertTriangle, IconCircleCheck, IconPlus, IconRefresh, IconShoppingBag } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { FlowHeader } from './FlowHeader';
import { ChristmasPromise } from './ChristmasPromise';
import { PickerBody, type Drawing, type PickerState } from './CardPackBuilder';
import { forgetResumeVisit, isResumeVisit, usePickerEdits } from './usePickerEdits';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { checkBundleAction } from '@/app/actions/bundle';
import { keepsakePickerAction } from '@/app/actions/keepsakePicker';
import type { CatalogueProduct } from '@/server/catalogue';
import { clampTransform, type ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import {
  BUNDLE_KEY, BUNDLE_PIECE_GEOM, BUNDLE_SIZES, bundleSizeOf, bundleSkuFor, bundleSummary,
  type BundleArt, type BundlePiece, type BundleSize, type BundleSpec,
} from '@/lib/christmas-bundle';
import { christmasBundleLine, newBundleLineId } from '@/lib/christmas-bundle-line';
import { defaultTransformFor } from '@/lib/catalogue-view';
import { gbp, shownSrc, toast, useBasket, useUpload } from '@/lib/store';

/**
 * The CHRISTMAS FAMILY BUNDLE builder (founder, 29 Oct — three sizes, no add-ons):
 *  (1) how many: a set for 2, 4 or 8 (that many placemats, coasters and ornaments);
 *  (2) the table: ONE drawing on every placemat; the coasters wear it too unless another is picked;
 *  (3) the ornaments: one drawing each — the placemats' until the shopper picks its own;
 *  (4) the picture of exactly that set, composed server-side from the founder's layers with these
 *      drawings (/api/mockup/bundle), and each drawing's print-quality check (the order gate's maths);
 *  (5) add to basket: ONE line, every drawing authz-checked server-side, priced by the server.
 * New drawings come in through the same picker workshop as the card packs + calendar (auto trim +
 * straighten, remove background, edit in the Studio) and the normal ingest (hash-check + moderation).
 *
 * Not in /mockups — extends the Scrapbook language of the calendar + card-pack builders (taped
 * polaroids, ink chips, the kraft thumb-zone dock, the bottom-sheet picker).
 */

const TAPES = ['rgb(246 196 69 / .8)', 'rgb(143 181 214 / .85)', 'rgb(232 120 110 / .8)', 'rgb(127 166 94 / .8)'];
const PICKER_TTL_MS = 8 * 60_000; // signed URLs live 10 min — refresh the list before they lapse
const DRAFT_KEY = 'sd_bundle_draft_v2'; // per tab: picks survive a trip to the Studio
const NEXT = `/customize/${BUNDLE_KEY}`;
/** The picker's slot numbers: 0 = the placemats, 1 = the coasters, 100+i = ornament i. */
const PLACEMATS = 0;
const COASTERS = 1;
const ORN = 100;
const MAX = 8;

/** null = "the placemats' drawing" (the coasters, each ornament). */
type Draft = { size: BundleSize; placemat: BundleArt | null; coaster: BundleArt | null; ornaments: Array<BundleArt | null> };
const EMPTY: Draft = { size: 2, placemat: null, coaster: null, ornaments: [] };

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
/** A piece's placement: its product's default (the order gate + the print file use the same). */
export const placeOf = (piece: string) => clampTransform(defaultTransformFor(piece));
const isArt = (a: unknown): a is BundleArt => !!a && typeof a === 'object' && typeof (a as BundleArt).assetId === 'string';

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Partial<Draft> | null;
    if (!d || typeof d !== 'object') return null;
    return {
      size: BUNDLE_SIZES.some((s) => s.n === d.size) ? (d.size as BundleSize) : 2,
      placemat: isArt(d.placemat) ? d.placemat : null,
      coaster: isArt(d.coaster) ? d.coaster : null,
      ornaments: (Array.isArray(d.ornaments) ? d.ornaments : []).slice(0, MAX).map((a) => (isArt(a) ? a : null)),
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

const slotName = (slot: number) => (slot === PLACEMATS ? 'the placemats' : slot === COASTERS ? 'the coasters' : `ornament ${slot - ORN + 1}`);
/** The spec the server will make from a draft (null until the placemats have a drawing). */
function specOf(d: Draft): BundleSpec | null {
  if (!d.placemat) return null;
  return { placemat: d.placemat, coaster: d.coaster, ornaments: Array.from({ length: d.size }, (_, i) => d.ornaments[i] ?? d.placemat!) };
}

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
  const [adding, setAdding] = useState(false);

  // ── load: the shop catalogue (prices + the ornament's variant for the basket thumb) and the keepsake box
  useEffect(() => {
    loadCatalogueAction()
      .then(setProducts)
      .catch(() => setProducts([])); // the builder still works on the seeded prices
  }, []);
  const loadPicker = useCallback(() => {
    setPicker({ status: 'loading' });
    keepsakePickerAction()
      .then((r) => setPicker(r.ok ? { status: 'ready', signedIn: r.signedIn, keepsakes: r.keepsakes, at: Date.now() } : { status: 'error' }))
      .catch(() => setPicker({ status: 'error' }));
  }, []);
  useEffect(loadPicker, [loadPicker]);
  const ornamentVariant = products?.find((p) => p.key === 'ceramicOrnament')?.variants.find((v) => v.isDefault)?.id ?? null;
  // the SERVER catalogue's price per size (the seeded figures stand in until it lands)
  const priceOf = (n: BundleSize) => products?.find((p) => p.key === BUNDLE_KEY)?.variants.find((v) => v.sku === bundleSkuFor(n))?.pricePence ?? BUNDLE_SIZES.find((s) => s.n === n)!.pricePence;

  // Seed once: a basket line (?edit=<id>) reopens exactly that bundle; else this tab's draft (only on
  // the way back from the Studio); else the drawing in progress goes on the table. ?size=4 picks a size.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const q = new URLSearchParams(window.location.search);
    const id = q.get('edit');
    const line = id ? useBasket.getState().items.find((i) => i.id === id && i.bundle) : null;
    if (line?.bundle && isArt(line.bundle.placemat)) {
      const b = line.bundle;
      const size = bundleSizeOf(line.sku) ?? 2;
      setEdit(line.id);
      setD({ size, placemat: b.placemat, coaster: b.coaster ?? null, ornaments: b.ornaments.map((a) => (a.assetId === b.placemat.assetId && (a.sourceObjectId ?? null) === (b.placemat.sourceObjectId ?? null) ? null : a)) });
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
    const asked = Number(q.get('size'));
    const size: BundleSize = asked === 4 || asked === 8 ? asked : 2;
    const u = useUpload.getState().upload;
    setD({ ...EMPTY, size, placemat: u?.assetId ? { assetId: u.assetId, ...(u.cutout?.sourceObjectId ? { sourceObjectId: u.cutout.sourceObjectId } : {}) } : null });
  }, []);
  // Keep this tab's draft (not while editing a basket line — that line IS the saved state).
  useEffect(() => {
    if (!seededRef.current || edit) return;
    writeDraft(d.placemat || d.coaster || d.ornaments.some(Boolean) ? d : null);
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
      const next = { ...old, placemat: fix(old.placemat), coaster: fix(old.coaster), ornaments: old.ornaments.map(fix) };
      const same = next.placemat === old.placemat && next.coaster === old.coaster && next.ornaments.every((a, i) => a === old.ornaments[i]);
      return same ? old : next;
    });
  }, [drawings]);
  const drawingFor = useCallback((assetId: string) => drawings.find((x) => x.assetId === assetId) ?? null, [drawings]);

  // ── what's being made ─────────────────────────────────────────────────────────────────────
  const spec = useMemo(() => specOf(d), [d]);
  const price = priceOf(d.size);
  // every (piece, drawing) pair once — for the print-quality check
  const pieces = useMemo(() => {
    if (!spec) return [];
    const out: Array<{ piece: BundlePiece; art: BundleArt; name: string }> = [
      { piece: 'placemat', art: spec.placemat, name: 'the placemats' },
      { piece: 'coaster', art: spec.coaster ?? spec.placemat, name: 'the coasters' },
    ];
    spec.ornaments.forEach((a, i) => out.push({ piece: 'ceramicOrnament', art: a, name: `ornament ${i + 1}` }));
    return out;
  }, [spec]);

  // The pixel size of each drawing — fed to the SAME assessment the order-time gate runs, per piece.
  useEffect(() => {
    const started = new Set<string>();
    for (const s of pieces) {
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
  }, [pieces, drawingFor, dims]);
  const assess = (piece: BundlePiece, a: BundleArt): ResolutionAssessment | null => {
    const src = dims[`${a.assetId}:${a.sourceObjectId ?? ''}`] ?? null;
    return src ? assessPrintResolution(BUNDLE_PIECE_GEOM[piece], src, placeOf(piece), piece) : null;
  };
  const blocked = pieces.find((s) => assess(s.piece, s.art)?.decision === 'BLOCK') ?? null;
  const soft = !blocked && pieces.some((s) => assess(s.piece, s.art)?.softUpClose);
  const checked = pieces.length > 0 && pieces.every((s) => assess(s.piece, s.art));

  // ── picking ────────────────────────────────────────────────────────────────────────────────
  const openSheet = (slot: number) => {
    if (picker.status === 'ready' && Date.now() - picker.at > PICKER_TTL_MS) loadPicker();
    const cur = slot === PLACEMATS ? d.placemat : slot === COASTERS ? (d.coaster ?? d.placemat) : (d.ornaments[slot - ORN] ?? d.placemat);
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
      if (slot === PLACEMATS) return { ...old, placemat: a };
      if (slot === COASTERS) return { ...old, coaster: a };
      const list = [...old.ornaments];
      while (list.length <= slot - ORN) list.push(null);
      list[slot - ORN] = a;
      return { ...old, ornaments: list };
    });
    setSheet(null);
    toast(`${slotName(slot)} ✓`);
  };

  // ── basket ─────────────────────────────────────────────────────────────────────────────────
  const addToBasket = async () => {
    if (!spec || blocked || adding) return;
    setAdding(true);
    try {
      // every drawing is checked server-side (may this buyer use it?) and the server prices the size
      const sku = bundleSkuFor(d.size);
      const res = await checkBundleAction(sku, spec);
      if (!res.ok) {
        toast(res.reason === 'not-allowed' ? 'one of those drawings isn’t yours to use — swap it for another' : 'we couldn’t add it just now — please try again');
        return;
      }
      const line = christmasBundleLine({ id: edit ?? newBundleLineId(), size: d.size, bundle: spec, pricePence: res.pricePence, previewVariantId: ornamentVariant ?? undefined });
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
  const tile = (a: BundleArt | null) => {
    const x = a ? drawingFor(a.assetId) : null;
    return x?.thumbUrl ?? x?.imageUrl ?? null;
  };

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] md:items-start lg:gap-12">
        {/* Left: the picture of exactly this set, with these drawings */}
        <div className="min-w-0 md:sticky md:top-20">
          <BundlePicture sku={bundleSkuFor(d.size)} spec={spec} size={d.size} onEmpty={() => openSheet(PLACEMATS)} />
          {spec ? (
            <p role="status" className={`mt-2 flex items-center justify-center gap-1 text-[12px] font-extrabold ${blocked ? 'text-cinnamon' : soft ? 'text-ink-soft' : 'text-green-save'}`}>
              {checked || blocked ? <Icon icon={blocked ? IconAlertTriangle : IconCircleCheck} size={14} /> : null}
              {blocked ? `the drawing on ${blocked.name} is too small to print well — tap it to swap it` : !checked ? 'checking the print quality…' : soft ? 'print-ready — a little soft up close' : 'every piece is print-ready'}
            </p>
          ) : null}
        </div>

        {/* Right: title → the three steps → what it adds up to → add to basket (bottom-right) */}
        <div className="flex flex-col">
          <h1 className="font-display text-[32px] leading-tight text-cocoa md:text-4xl">christmas family bundle</h1>
          <p className="mt-1 text-sm text-ink-soft">their drawings on the christmas table and on the tree — placemats, coasters and an ornament for everyone, in one parcel.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="sticker inline-flex rotate-[-2deg] rounded-[12px] bg-honey px-3 py-1 font-display text-2xl text-cocoa" aria-live="polite">
              {gbp(price)}
            </span>
            <span className="text-xs font-semibold text-green-save">free tracked delivery · one parcel</span>
            <ChristmasPromise productKey={BUNDLE_KEY} />
          </div>

          {/* 1 · how many */}
          <Step n={1} title="how many?" note="a placemat, a coaster and an ornament for each of you">
            <div role="radiogroup" aria-label="how many of each" className="grid grid-cols-3 gap-2">
              {BUNDLE_SIZES.map((s) => {
                const on = s.n === d.size;
                return (
                  <button
                    key={s.n}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setD((x) => ({ ...x, size: s.n }))}
                    className={`press flex min-h-11 flex-col items-center justify-center rounded-[12px] border-2 px-2 py-2 text-cocoa focus-visible:outline-2 ${on ? 'border-cocoa bg-honey shadow-[0_2px_0_var(--color-cocoa)]' : 'border-cocoa/25 bg-paper hover:border-cocoa'}`}
                  >
                    <span className="text-sm font-extrabold lowercase">a set for {s.n}</span>
                    <span className="text-xs font-bold">{gbp(priceOf(s.n))}</span>
                  </button>
                );
              })}
            </div>
          </Step>

          {/* 2 · the table */}
          <Step n={2} title="the table" note={`one drawing on all ${d.size} placemats — and on the coasters too, unless you pick another`}>
            <div className="flex flex-wrap gap-x-5 gap-y-4">
              <Piece
                label="placemats"
                url={tile(d.placemat)}
                i={0}
                note={d.placemat ? drawingFor(d.placemat.assetId)?.label ?? 'a drawing' : 'pick a drawing'}
                aria={d.placemat ? `the placemats' drawing — swap it` : 'pick a drawing for the placemats'}
                onClick={() => openSheet(PLACEMATS)}
                blocked={!!d.placemat && assess('placemat', d.placemat)?.decision === 'BLOCK'}
              />
              <Piece
                label="coasters"
                url={tile(d.coaster ?? d.placemat)}
                i={1}
                note={d.coaster ? drawingFor(d.coaster.assetId)?.label ?? 'a drawing' : 'same as the placemats'}
                aria={d.coaster ? `the coasters' drawing — swap it` : 'the coasters wear the placemats’ drawing — pick a different one'}
                onClick={() => openSheet(COASTERS)}
                blocked={!!(d.coaster ?? d.placemat) && assess('coaster', (d.coaster ?? d.placemat)!)?.decision === 'BLOCK'}
                reset={d.coaster ? { label: 'use the placemats’ drawing on the coasters', onClick: () => setD((x) => ({ ...x, coaster: null })) } : undefined}
              />
            </div>
          </Step>

          {/* 3 · the ornaments */}
          <Step n={3} title="the ornaments" note="one each — the placemats’ drawing until you pick its own">
            <ol className="flex flex-wrap gap-x-4 gap-y-4" aria-label="the ornaments">
              {Array.from({ length: d.size }, (_, i) => {
                const own = d.ornaments[i] ?? null;
                const a = own ?? d.placemat;
                return (
                  <li key={i}>
                    <Piece
                      label={`ornament ${i + 1}`}
                      url={tile(a)}
                      i={i + 2}
                      note={own ? 'its own drawing' : 'the placemats’'}
                      aria={own ? `ornament ${i + 1}'s drawing — swap it` : `ornament ${i + 1} wears the placemats’ drawing — pick its own`}
                      onClick={() => openSheet(ORN + i)}
                      blocked={!!a && assess('ceramicOrnament', a)?.decision === 'BLOCK'}
                      round
                      reset={own ? { label: `ornament ${i + 1}: use the placemats’ drawing`, onClick: () => setD((x) => ({ ...x, ornaments: x.ornaments.map((o, j) => (j === i ? null : o)) })) } : undefined}
                    />
                  </li>
                );
              })}
            </ol>
          </Step>

          {/* What it adds up to — no surprises */}
          <section aria-label="what’s in your bundle" className="mt-6 rounded-[16px] border-2 border-cocoa/15 bg-paper p-4">
            <p className="flex justify-between gap-3 text-sm font-extrabold text-cocoa">
              <span>a set for {d.size} · {bundleSummary(d.size)}</span>
              <span>{gbp(price)}</span>
            </p>
            <CaveatNote className="mt-2 text-lg">no names, just their drawings — they’re only little once ✶</CaveatNote>
          </section>

          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none md:flex md:flex-col md:items-end">
            {spec ? (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => void addToBasket()} disabled={!!blocked || adding}>
                <Icon icon={IconShoppingBag} size={16} /> {adding ? 'checking your drawings…' : edit ? 'update basket' : 'add to basket'} · {gbp(price)}
              </Button>
            ) : (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => openSheet(PLACEMATS)}>
                <Icon icon={IconPlus} size={16} /> pick a drawing for the table
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
              {sheet ? `use it for ${slotName(sheet.slot)}` : 'use this one'}
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

/** One piece's drawing: a taped polaroid (tap to pick / swap), its name, and an optional "back to the placemats'" link. */
function Piece({
  label, url, i, note, aria, onClick, blocked, round, reset,
}: {
  label: string;
  url: string | null;
  i: number;
  note: string;
  aria: string;
  onClick: () => void;
  blocked?: boolean;
  round?: boolean;
  reset?: { label: string; onClick: () => void };
}) {
  return (
    <div className="w-24">
      <div
        className="polaroid tape relative w-24 shrink-0 !p-1.5"
        style={{ ['--tilt' as string]: i % 2 ? '1.2deg' : '-1.4deg', ['--tape' as string]: TAPES[i % TAPES.length], ['--tape-rot' as string]: i % 2 ? '4deg' : '-3deg' }}
      >
        <div className={`relative aspect-square w-full overflow-hidden bg-white ${round ? 'rounded-full' : ''} ${blocked ? 'ring-2 ring-cinnamon' : ''}`}>
          {url ? <img src={url} alt="" loading="lazy" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-cinnamon"><Icon icon={IconPlus} size={18} /></span>}
          <button type="button" onClick={onClick} aria-label={aria} className="absolute inset-0 focus-visible:outline-2" />
        </div>
      </div>
      <p className="mt-1.5 text-[12px] font-extrabold lowercase leading-tight text-cocoa">{label}</p>
      <p className={`text-[11px] font-semibold leading-tight ${blocked ? 'text-cinnamon' : 'text-ink-soft'}`}>{blocked ? 'too small to print' : note}</p>
      {reset ? (
        <button type="button" onClick={reset.onClick} aria-label={reset.label} className="relative mt-0.5 text-[11px] font-bold text-cinnamon underline decoration-dotted before:absolute before:-inset-x-1 before:-inset-y-3 before:content-['']">
          undo
        </button>
      ) : null}
    </div>
  );
}

/**
 * The picture of exactly this set: the founder's layout for the size with these drawings, composed
 * server-side (/api/mockup/bundle — every drawing authz-checked there). The last picture stays up
 * while a new one is made; a calm skeleton before the first; a quiet retry if it fails.
 */
function BundlePicture({ sku, spec, size, onEmpty }: { sku: string; spec: BundleSpec | null; size: BundleSize; onEmpty: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [attempt, setAttempt] = useState(0);
  const body = spec ? JSON.stringify({ sku, bundle: spec }) : null;
  useEffect(() => {
    if (!body) return;
    // a newer picture supersedes this one: its answer is dropped. (Not aborted — a request cut off
    // mid-render only makes the server log a broken pipe; the short pause keeps the spares rare.)
    let stale = false;
    setState('loading');
    // a short pause: a run of quick picks makes one picture, not five
    const t = window.setTimeout(() => {
      fetch('/api/mockup/bundle', { method: 'POST', headers: { 'content-type': 'application/json' }, body })
        .then(async (r) => {
          if (!r.ok) throw new Error(String(r.status));
          const blob = await r.blob();
          if (stale) return;
          const next = URL.createObjectURL(blob);
          setUrl((old) => {
            if (old) URL.revokeObjectURL(old);
            return next;
          });
          setState('idle');
        })
        .catch(() => {
          if (!stale) setState('error');
        });
    }, 120);
    return () => {
      stale = true;
      window.clearTimeout(t);
    };
  }, [body, attempt]);
  useEffect(() => () => {
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
  }, []);

  if (!spec) {
    return (
      <button
        type="button"
        onClick={onEmpty}
        className="press mx-auto flex aspect-square w-full max-w-xl flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-cocoa/30 bg-paper/60 text-sm font-bold text-ink-soft hover:border-cocoa"
      >
        <Icon icon={IconPlus} size={22} className="text-cinnamon" />
        pick a drawing for the table to see your set here
      </button>
    );
  }
  return (
    <div className="polaroid relative mx-auto w-full max-w-xl !p-2.5" style={{ ['--tilt' as string]: '-0.5deg' }}>
      <div className="relative aspect-square w-full overflow-hidden rounded-[6px] bg-paper-2">
        {url ? (
          <img src={url} alt={`your set for ${size}: ${size} placemats, ${size} coasters and ${size} ornaments with your drawings`} className={`h-full w-full object-cover transition-opacity duration-150 ${state === 'loading' ? 'opacity-80' : ''}`} />
        ) : state !== 'error' ? (
          <div className="h-full w-full animate-pulse bg-paper-2" aria-label="drawing your set…" role="img" />
        ) : null}
        {state === 'error' ? (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-paper/90 p-2 text-[12px] font-bold text-cocoa" role="status">
            we couldn’t draw the picture just now — your set is fine
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className="press inline-flex min-h-11 items-center gap-1 rounded-full px-2 text-cinnamon">
              <Icon icon={IconRefresh} size={14} /> try again
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
