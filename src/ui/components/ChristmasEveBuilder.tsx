'use client';

import { IconAlertTriangle, IconPlus, IconShoppingBag } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { ChristmasPromise } from './ChristmasPromise';
import { MultiBuyNotice } from './MultiBuy';
import { PickerBody, type Drawing, type PickerState } from './CardPackBuilder';
import { AddTile, BundleFlip, PiecePreview, Polaroid, Shell, Step, placeOf, type Shown } from './ChristmasBundleBuilder';
import { forgetResumeVisit, isResumeVisit, usePickerEdits } from './usePickerEdits';
import { loadCatalogueAction } from '@/app/actions/catalogue';
import { checkEveAction, eveOfferAction } from '@/app/actions/bundle';
import { keepsakePickerAction } from '@/app/actions/keepsakePicker';
import type { CatalogueProduct } from '@/server/catalogue';
import type { ResolutionAssessment } from '@/server/print/geometry';
import { assessPrintResolution } from '@/server/print/pattern-geometry';
import { BUNDLE_PIECE_GEOM, type BundleArt } from '@/lib/christmas-bundle';
import { EVE_KEY, EVE_PIECES, EVE_PRICE_PENCE, MUG_COLOURS, artFor, eveSummary, mugSkuFor, type EvePiece, type EveSpec, type MugColour } from '@/lib/christmas-eve';
import { gbp, shownSrc, toast, useBasket, useUpload } from '@/lib/store';

/**
 * The CHRISTMAS EVE BUNDLE builder (founder, 27 Oct): a sack + a ceramic ornament + a two-tone mug.
 *  (1) the drawing — on all three;
 *  (2) optionally, a different drawing for any one of them;
 *  (3) the mug's colour;
 *  then a flip-through of the three with each one's print-quality check → add to basket (every drawing
 *  authz-checked server-side, priced by the server). Uploads go through the same picker workshop as the
 *  family bundle, card packs + calendar (auto trim + straighten, remove background, edit in Studio).
 * Not in /mockups — the Scrapbook language of the family-bundle builder, whose pieces it reuses.
 */

const PICKER_TTL_MS = 8 * 60_000;
const DRAFT_KEY = 'sd_eve_draft';
const NEXT = `/customize/${EVE_KEY}`;
/** Picker slots: 0 = the drawing; 1–3 = the sack / the ornament / the mug's own. */
const PIECE_SLOT: Record<EvePiece, number> = { sack: 1, ceramicOrnament: 2, mug: 3 };
const PIECE_NAME: Record<EvePiece, string> = { sack: 'the sack', ceramicOrnament: 'the ornament', mug: 'the mug' };
const slotPiece = (slot: number): EvePiece | null => EVE_PIECES.find((p) => PIECE_SLOT[p] === slot) ?? null;
const slotName = (slot: number) => (slot === 0 ? 'all three' : PIECE_NAME[slotPiece(slot)!]);
/** The mug's print area if the catalogue hasn't said (Prodigi's 11oz wrap, 209 × 98 mm @300 dpi). */
const MUG_GEOM = { printWidthPx: 2469, printHeightPx: 1157, bleedMm: 3, requiredDpi: 300 };

type Draft = { drawing: BundleArt | null; own: Partial<Record<EvePiece, BundleArt>>; mugColour: MugColour };
const EMPTY: Draft = { drawing: null, own: {}, mugColour: 'blue' };
const newEveLineId = () => `eve-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

function readDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    return d && typeof d === 'object' ? { drawing: d.drawing ?? null, own: d.own ?? {}, mugColour: MUG_COLOURS.includes(d.mugColour) ? d.mugColour : 'blue' } : null;
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

export function ChristmasEveBuilder() {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const add = useBasket((s) => s.add);
  const update = useBasket((s) => s.update);

  const [products, setProducts] = useState<CatalogueProduct[] | null>(null);
  const [offer, setOffer] = useState<{ pricePence: number; separatelyPence: number; multiBuyBps: number[] } | null>(null);
  const [d, setD] = useState<Draft>(EMPTY);
  const [edit, setEdit] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>({ status: 'loading' });
  const [sheet, setSheet] = useState<{ slot: number; advance: boolean } | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [dims, setDims] = useState<Record<string, { width: number; height: number } | null>>({});
  const [view, setView] = useState(0);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadCatalogueAction().then(setProducts).catch(() => setProducts([]));
    eveOfferAction().then(setOffer).catch(() => setOffer(null));
  }, []);
  const loadPicker = useCallback(() => {
    setPicker({ status: 'loading' });
    keepsakePickerAction()
      .then((r) => setPicker(r.ok ? { status: 'ready', signedIn: r.signedIn, keepsakes: r.keepsakes, at: Date.now() } : { status: 'error' }))
      .catch(() => setPicker({ status: 'error' }));
  }, []);
  useEffect(loadPicker, [loadPicker]);

  // the pieces' real variants (for their mockups + print areas): the sack, the ornament, the mug in its colour
  const variantFor = (p: EvePiece) => {
    const prod = products?.find((x) => x.key === p);
    return (p === 'mug' ? prod?.variants.find((v) => v.sku === mugSkuFor(d.mugColour)) : prod?.variants.find((v) => v.isDefault)) ?? null;
  };
  const geomFor = (p: EvePiece) => variantFor(p)?.printGeom ?? (p === 'mug' ? MUG_GEOM : BUNDLE_PIECE_GEOM[p]);

  // Seed once: a basket line (?edit=<id>) reopens that bundle; else this tab's draft (back from the
  // Studio); else the drawing in progress goes on all three.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const id = new URLSearchParams(window.location.search).get('edit');
    const line = id ? useBasket.getState().items.find((i) => i.id === id && i.eve) : null;
    if (line?.eve) {
      setEdit(line.id);
      setD({ drawing: line.eve.drawing, own: { ...line.eve.own }, mugColour: line.eve.mugColour });
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
    if (u?.assetId) setD((x) => ({ ...x, drawing: { assetId: u.assetId!, ...(u.cutout?.sourceObjectId ? { sourceObjectId: u.cutout.sourceObjectId } : {}) } }));
  }, []);
  useEffect(() => {
    if (!seededRef.current || edit) return;
    writeDraft(d.drawing ? d : null);
  }, [d, edit]);

  const drawingsRaw = useMemo(() => {
    const list: Drawing[] = [];
    if (upload?.assetId) list.push({ assetId: upload.assetId, imageUrl: shownSrc(upload) ?? upload.dataUrl, sourceObjectId: upload.cutout?.sourceObjectId, label: 'this drawing', printable: true });
    if (picker.status === 'ready') {
      for (const k of picker.keepsakes) {
        if (list.some((x) => x.assetId === k.id)) continue;
        const when = shortDate(k.createdAtISO);
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
  const drawingFor = useCallback((assetId: string) => drawings.find((x) => x.assetId === assetId) ?? null, [drawings]);

  // ── what's being made ─────────────────────────────────────────────────────────────────────
  const spec: EveSpec | null = useMemo(() => (d.drawing ? { drawing: d.drawing, own: d.own, mugColour: d.mugColour } : null), [d]);
  const shown: Array<Shown<EvePiece>> = useMemo(() => (spec ? EVE_PIECES.map((p) => ({ piece: p, art: artFor(spec, p), name: PIECE_NAME[p], count: 1, slot: PIECE_SLOT[p] })) : []), [spec]);

  useEffect(() => {
    for (const s of shown) {
      const x = drawingFor(s.art.assetId);
      const key = `${s.art.assetId}:${s.art.sourceObjectId ?? ''}`;
      if (!x?.imageUrl || key in dims) continue;
      if (x.px) {
        const px = x.px;
        setDims((m) => ({ ...m, [key]: { width: px.width, height: px.height } }));
        continue;
      }
      setDims((m) => ({ ...m, [key]: null }));
      const img = new window.Image();
      img.onload = () => setDims((m) => ({ ...m, [key]: img.naturalWidth && img.naturalHeight ? { width: img.naturalWidth, height: img.naturalHeight } : null }));
      img.src = x.imageUrl;
    }
  }, [shown, drawingFor, dims]);
  const dimsOf = (a: BundleArt) => dims[`${a.assetId}:${a.sourceObjectId ?? ''}`] ?? null;
  const assess = (s: Shown<EvePiece>): ResolutionAssessment | null => {
    const src = dimsOf(s.art);
    return src ? assessPrintResolution(geomFor(s.piece), src, placeOf(s.piece), s.piece) : null;
  };
  const badgeOf = (q: ResolutionAssessment | null) => (!q ? null : q.decision === 'BLOCK' ? 'too small to print' : q.softUpClose ? 'a little soft up close' : 'print-ready');
  const blocked = shown.find((s) => assess(s)?.decision === 'BLOCK') ?? null;
  const price = offer?.pricePence ?? EVE_PRICE_PENCE;

  // ── picking ────────────────────────────────────────────────────────────────────────────────
  const openSheet = (slot: number) => {
    if (picker.status === 'ready' && Date.now() - picker.at > PICKER_TTL_MS) loadPicker();
    const p = slotPiece(slot);
    setChosen((p ? d.own[p] : d.drawing)?.assetId ?? null);
    setSheet({ slot, advance: false });
  };
  const putIt = () => {
    if (!sheet || !chosen) return;
    const x = drawingFor(chosen);
    if (!x) return;
    const a: BundleArt = { assetId: x.assetId, ...(x.sourceObjectId ? { sourceObjectId: x.sourceObjectId } : {}) };
    const p = slotPiece(sheet.slot);
    setD((old) => (p ? { ...old, own: { ...old.own, [p]: a } } : { ...old, drawing: a }));
    setView(p ? EVE_PIECES.indexOf(p) : 0);
    setSheet(null);
    toast(`${slotName(sheet.slot)} ✓`);
  };
  const backToMain = (p: EvePiece) =>
    setD((old) => {
      const own = { ...old.own };
      delete own[p];
      return { ...old, own };
    });

  // ── basket ─────────────────────────────────────────────────────────────────────────────────
  const addToBasket = async () => {
    if (!spec || blocked || adding) return;
    setAdding(true);
    try {
      const res = await checkEveAction(spec);
      if (!res.ok) {
        toast(res.reason === 'not-allowed' ? 'one of those drawings isn’t yours to use — swap it for another' : 'we couldn’t add it just now — please try again');
        return;
      }
      const line = { id: edit ?? newEveLineId(), name: 'christmas eve bundle', product: EVE_KEY, sku: EVE_KEY, pricePence: res.pricePence, sub: eveSummary(spec), eve: spec, ...(variantFor('ceramicOrnament') ? { previewVariantId: variantFor('ceramicOrnament')!.id } : {}) } as const;
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

  const tile = (a: BundleArt) => {
    const x = drawingFor(a.assetId);
    return x?.thumbUrl ?? x?.imageUrl ?? null;
  };
  const sheetDrawing = chosen ? drawingFor(chosen) : null;

  return (
    <Shell>
      <div className="grid gap-7 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] md:items-start lg:gap-12">
        <div className="min-w-0 md:sticky md:top-20">
          <BundleFlip
            shown={shown}
            view={Math.min(view, Math.max(0, shown.length - 1))}
            onView={setView}
            render={(s) => <PiecePreview s={s} imageUrl={drawingFor(s.art.assetId)?.imageUrl ?? null} src={dimsOf(s.art)} variantId={variantFor(s.piece)?.id ?? null} geom={geomFor(s.piece)} />}
            badge={(s) => {
              const q = assess(s);
              return { text: badgeOf(q), block: q?.decision === 'BLOCK', soft: !!q?.softUpClose };
            }}
            onEmpty={() => openSheet(0)}
            emptyLabel="pick a drawing to see the sack, the ornament and the mug"
          />
        </div>

        <div className="flex flex-col">
          <h1 className="font-display text-[32px] leading-tight text-cocoa md:text-4xl">christmas eve bundle</h1>
          <p className="mt-1 text-sm text-ink-soft">a sack to fill, an ornament for the tree and a mug for the cocoa — their christmas eve, made real.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2.5">
            <span className="sticker inline-flex rotate-[-2deg] rounded-[12px] bg-honey px-3 py-1 font-display text-2xl text-cocoa">{gbp(price)}</span>
            {offer && offer.separatelyPence > price ? (
              <span className="text-xs font-semibold text-ink-soft">
                <span className="line-through">{gbp(offer.separatelyPence)}</span> separately
              </span>
            ) : null}
            <span className="text-xs font-semibold text-green-save">free tracked delivery · one parcel</span>
            <ChristmasPromise productKey={EVE_KEY} />
          </div>
          {/* one per child? the bundles have their OWN multi-buy, from their costs */}
          <MultiBuyNotice tiers={offer?.multiBuyBps} productLabel="christmas eve bundle" subtitle="one for each little one? the more bundles, the more you save" />

          <Step n={1} title="the drawing" note="one drawing on the sack, the ornament and the mug">
            {d.drawing ? (
              <div className="flex items-center gap-3">
                <Polaroid url={tile(d.drawing)} i={0} label={`the drawing: ${drawingFor(d.drawing.assetId)?.label ?? 'a drawing'} — swap it`} onClick={() => openSheet(0)} />
                <Button variant="secondary" size="md" onClick={() => openSheet(0)}>
                  swap the drawing
                </Button>
              </div>
            ) : (
              <AddTile label="pick a drawing" sub="from your keepsake box, or upload one" onClick={() => openSheet(0)} wide />
            )}
          </Step>

          {d.drawing ? (
            <Step n={2} title="one each? (optional)" note="give any of them a different drawing">
              <ul className="flex flex-wrap gap-x-4 gap-y-4">
                {EVE_PIECES.map((p, i) => {
                  const own = d.own[p];
                  const a = own ?? d.drawing!;
                  const bad = assess({ piece: p, art: a, name: PIECE_NAME[p], count: 1, slot: PIECE_SLOT[p] })?.decision === 'BLOCK';
                  return (
                    <li key={p} className="flex flex-col items-start gap-1.5">
                      <div className={own ? '' : 'opacity-60'}>
                        <Polaroid url={tile(a)} i={i + 1} blocked={bad} label={`${PIECE_NAME[p]}: ${own ? 'its own drawing' : 'the main drawing'} — pick its own`} onClick={() => openSheet(PIECE_SLOT[p])} />
                      </div>
                      <p className="text-[12px] font-extrabold lowercase text-cocoa">{PIECE_NAME[p]}</p>
                      {own ? (
                        <button type="button" onClick={() => backToMain(p)} className="min-h-11 text-[12px] font-bold text-cinnamon underline-offset-2 hover:underline">
                          use the main drawing
                        </button>
                      ) : (
                        <button type="button" onClick={() => openSheet(PIECE_SLOT[p])} className="min-h-11 text-[12px] font-bold text-cinnamon underline-offset-2 hover:underline">
                          pick its own
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Step>
          ) : null}

          <Step n={d.drawing ? 3 : 2} title="the mug" note="a two-tone 11oz mug — pick its colour">
            <div className="flex flex-wrap gap-2" role="group" aria-label="mug colour">
              {MUG_COLOURS.map((c) => (
                <Chip key={c} active={d.mugColour === c} onClick={() => setD((x) => ({ ...x, mugColour: c }))} className="min-h-11">
                  {c}
                </Chip>
              ))}
            </div>
          </Step>

          <CaveatNote className="mt-6 text-lg">one for each of them — they’re only little once ✶</CaveatNote>

          <div className="pb-safe kraft fixed inset-x-0 bottom-0 z-30 rounded-t-[22px] border-t-2 border-cocoa/10 px-4 pt-3 shadow-[0_-6px_18px_color-mix(in_srgb,var(--color-cocoa)_12%,transparent)] md:static md:z-auto md:mt-6 md:rounded-none md:border-0 md:bg-transparent md:bg-none md:p-0 md:shadow-none md:flex md:flex-col md:items-end">
            {blocked ? (
              <p role="status" className="mb-2 flex items-start gap-1.5 text-[12px] font-semibold text-cocoa">
                <Icon icon={IconAlertTriangle} size={15} className="mt-px shrink-0 text-cinnamon" />
                the drawing on {blocked.name} is too small to print well — tap it to swap it for another.
              </p>
            ) : null}
            {spec ? (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => void addToBasket()} disabled={!!blocked || adding}>
                <Icon icon={IconShoppingBag} size={16} /> {adding ? 'checking your drawings…' : edit ? 'update basket' : 'add to basket'} · {gbp(price)}
              </Button>
            ) : (
              <Button size="lg" className="w-full whitespace-nowrap md:w-auto md:!px-8" onClick={() => openSheet(0)}>
                <Icon icon={IconPlus} size={16} /> pick a drawing
              </Button>
            )}
          </div>
        </div>
      </div>

      <Modal
        open={sheet !== null}
        onClose={() => setSheet(null)}
        size="md"
        title={sheet ? (sheet.slot === 0 ? 'pick a drawing for all three' : `pick a drawing for ${slotName(sheet.slot)}`) : 'pick a drawing'}
        subtitle="from your keepsake box"
        footer={
          drawings.length > 0 ? (
            <Button size="md" className="w-full" onClick={putIt} disabled={!sheetDrawing?.printable}>
              {sheet?.slot === 0 ? 'use it on all three' : `use it on ${sheet ? slotName(sheet.slot) : 'this one'}`}
            </Button>
          ) : null
        }
      >
        <PickerBody picker={picker} drawings={drawings} chosen={chosen} onChoose={setChosen} onRetry={loadPicker} next={NEXT} forWhat="your christmas eve bundle" tools={tools} />
      </Modal>
    </Shell>
  );
}
