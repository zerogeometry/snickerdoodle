'use client';

import { IconMinus, IconPlus, IconSparkles, IconZoomScan } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { ProductMockup, type ProductKey } from '@/ui/components/ProductArt';
import { basketCount, basketSubtotal, gbp, toast, useBasket, useUpload } from '@/lib/store';
import { startGuestUpload } from '@/app/actions/guestUpload';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';

const DEFAULT_TF = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };

function variantSub(v: CatalogueVariant): string | undefined {
  const bits = [v.attributes.size, v.attributes.colour].filter(Boolean);
  return bits.length ? bits.join(' · ') : undefined;
}

/**
 * The shared "your art on a range" grid — used by the uploaded page and the full
 * catalogue. Each tile previews the real drawing on the product, with qty controls
 * and a Customize button; the footer tallies a running total + Create Another /
 * Checkout Now. The upload is ingested lazily (once) the first time it's needed.
 */
export function FlowCatalogue({
  products,
  showCategories = false,
  compact = false,
  scrollable = false,
  className,
}: {
  products: CatalogueProduct[];
  showCategories?: boolean;
  compact?: boolean; // denser grid for the narrower uploaded-page column
  scrollable?: boolean; // scroll the full range inside a fixed-height container
  className?: string;
}) {
  const router = useRouter();
  const upload = useUpload((s) => s.upload);
  const termsAccepted = useUpload((s) => s.termsAccepted);
  const setAssetId = useUpload((s) => s.setAssetId);
  const items = useBasket((s) => s.items);
  const add = useBasket((s) => s.add);
  const setQty = useBasket((s) => s.setQty);

  const [category, setCategory] = useState('all');
  const [zoom, setZoom] = useState<CatalogueProduct | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = useMemo(() => ['all', ...new Set(products.map((p) => p.category.toLowerCase()))], [products]);
  const shown = products.filter((p) => p.category !== 'ADDON' && (category === 'all' || p.category.toLowerCase() === category));
  const subtotal = basketSubtotal(items);
  const count = basketCount(items);
  const mockImg = upload?.cutout?.url ?? upload?.dataUrl ?? null; // bg-removed cutout wins

  // Ingest the upload server-side once, so add-to-basket + render have a real asset.
  const ensureAsset = useCallback(async (): Promise<string | null> => {
    if (upload?.assetId) return upload.assetId;
    if (!upload || !termsAccepted) return null;
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
  }, [upload, termsAccepted, setAssetId]);

  const guardUpload = (): boolean => {
    if (!upload) {
      toast('upload a drawing first');
      router.push('/start-creating');
      return false;
    }
    if (!termsAccepted) {
      toast('tick the terms to continue');
      return false;
    }
    return true;
  };

  const defaultVariant = (p: CatalogueProduct) => p.variants.find((v) => v.isDefault) ?? p.variants[0]!;
  const lineId = (sku: string) => `cat-${sku}`;
  const tileQty = (p: CatalogueProduct) => items.find((i) => i.id === lineId(defaultVariant(p).sku))?.qty ?? 0;

  const quickAdd = async (p: CatalogueProduct, delta: number) => {
    if (busy) return;
    const def = defaultVariant(p);
    const id = lineId(def.sku);
    const existing = items.find((i) => i.id === id);
    if (delta < 0) {
      if (existing) setQty(id, existing.qty - 1);
      return;
    }
    if (!guardUpload()) return;
    setBusy(true);
    try {
      const assetId = await ensureAsset();
      if (!assetId) return;
      if (existing) setQty(id, existing.qty + 1);
      else
        add({
          id,
          name: p.label,
          product: p.key as ProductKey,
          sku: def.sku,
          variantId: def.id,
          pricePence: def.pricePence,
          sub: variantSub(def),
          artwork: { assetId, transform: DEFAULT_TF, sourceObjectId: upload?.cutout?.sourceObjectId },
        });
    } finally {
      setBusy(false);
    }
  };

  const customize = async (p: CatalogueProduct) => {
    if (busy || !guardUpload()) return;
    setBusy(true);
    try {
      const assetId = await ensureAsset();
      if (assetId) router.push(`/customize/${p.key}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      {upload && !termsAccepted ? <TermsGate /> : null}

      {showCategories ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className={scrollable ? 'max-h-[30rem] overflow-y-auto pr-1' : undefined}>
      <div className={`grid gap-3 md:gap-4 ${compact ? 'grid-cols-2 md:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
        {shown.map((p) => {
          const qty = tileQty(p);
          return (
            <div key={p.key} className="group relative flex flex-col overflow-hidden rounded-2xl border border-[#EADFC9] bg-[#FFFDF8] shadow-[0_2px_6px_rgba(46,39,35,.06)]">
              <div className="relative flex h-32 items-center justify-center bg-[#FBF5E9]">
                <ProductMockup product={p.key as ProductKey} image={mockImg} size={104} uid={p.key} />
                {/* tap/click to enlarge — same on desktop + mobile, so it never covers the controls */}
                <button
                  type="button"
                  onClick={() => setZoom(p)}
                  aria-label={`Enlarge ${p.label} preview`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/85 p-1 text-[#7A6A58] shadow-sm hover:text-cinnamon"
                >
                  <Icon icon={IconZoomScan} size={15} />
                </button>
              </div>

              <div className="flex flex-1 flex-col gap-2 border-t border-[#EFE6D6] px-3 py-2.5">
                <div className="flex items-baseline justify-between gap-1">
                  <span className="min-w-0 truncate text-sm font-bold text-cocoa">{p.label}</span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-[#9C8E7E]">from {gbp(p.fromPence)}</span>
                </div>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <div className="flex items-center rounded-full border border-[#E6D8BE] bg-white">
                    <button type="button" aria-label={`one fewer ${p.label}`} onClick={() => quickAdd(p, -1)} disabled={qty === 0} className="px-2 py-1 text-[#7A6A58] disabled:opacity-30">
                      <Icon icon={IconMinus} size={13} />
                    </button>
                    <span className="min-w-5 text-center text-xs font-bold text-cocoa">{qty}</span>
                    <button type="button" aria-label={`add a ${p.label}`} onClick={() => quickAdd(p, 1)} className="px-2 py-1 text-cinnamon">
                      <Icon icon={IconPlus} size={13} />
                    </button>
                  </div>
                  <button type="button" onClick={() => customize(p)} className="rounded-full border border-[#E6D8BE] bg-white px-2.5 py-1 text-[11px] font-bold text-cocoa hover:border-honey">
                    customize
                  </button>
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Footer: basket count (so "Create another" clearly keeps the basket) + total + actions */}
      <div className="mt-5 rounded-2xl border border-[#EADFC9] bg-[#FFFDF8] p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-cocoa">
            {count > 0 ? `${count} item${count === 1 ? '' : 's'} added to your basket` : 'nothing added yet'}
          </span>
          <div className="text-right">
            <div className="font-display text-xl font-semibold text-cocoa">{gbp(subtotal)}</div>
            <div className="text-[11px] text-[#9C8E7E]">shipping TBC</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2.5">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => { useUpload.getState().resetUpload(); router.push('/start-creating'); }}>
            create another
          </Button>
          <Button size="lg" className="flex-1" onClick={() => router.push('/checkout')} disabled={items.length === 0}>
            checkout now <Icon icon={IconSparkles} size={15} />
          </Button>
        </div>
      </div>

      <Modal open={!!zoom} onClose={() => setZoom(null)} title={zoom?.label ?? ''} subtitle={zoom ? `from ${gbp(zoom.fromPence)}` : undefined}>
        {zoom ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <div className="rounded-2xl bg-[#FBF5E9] p-3">
              <ProductMockup product={zoom.key as ProductKey} image={mockImg} size={240} uid="modal" />
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

/** Inline terms consent — the lawful basis for ingesting the drawing, shown when an
 * upload is present but not yet agreed. */
function TermsGate() {
  const termsAccepted = useUpload((s) => s.termsAccepted);
  const setTermsAccepted = useUpload((s) => s.setTermsAccepted);
  return (
    <label className="mb-4 flex items-start gap-2 rounded-xl border border-[#E6D8BE] bg-[#FCF6EC] px-3 py-2.5 text-[12px] leading-relaxed text-[#6F6358]">
      <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-cta" />
      <span>
        tick to agree to the{' '}
        <a href="/trust/terms" className="font-semibold text-cinnamon underline">terms</a> &amp;{' '}
        <a href="/trust/privacy" className="font-semibold text-cinnamon underline">privacy notice</a> — we use your drawing to make your previews &amp; products, deleted within 30 days unless you keep it.
      </span>
    </label>
  );
}
