'use client';

import { IconPlus, IconShirt, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/ui/primitives/Button';
import { Chip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';
import { MockupPreview } from '@/ui/components/MockupPreview';
import { type ProductKey } from '@/ui/components/ProductArt';
import { gbp, toast, useBasket, usePlacements, type Upload } from '@/lib/store';
import { lineIdForSku } from '@/lib/catalogue-view';
import { FAMILY_SET_MIN_QTY, isFamilySetKey } from '@/pricing';
import type { CatalogueProduct, CatalogueVariant } from '@/server/catalogue';

const DEFAULT_TF = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }; // scale 0 = fit the WHOLE image

/** The garments a family set is built from, in display order, with warm row labels. */
const SET_MEMBERS: { key: string; who: string }[] = [
  { key: 'kidsTee', who: 'for the little artist' },
  { key: 'adultTee', who: 'for their biggest fan' },
  { key: 'babyBodysuit', who: 'for the littlest' },
];

type Member = { uid: number; key: string; size: string | null; colour: string | null };

function resolveVariant(p: CatalogueProduct, m: Member): CatalogueVariant | null {
  return (
    p.variants.find(
      (v) => (p.sizes.length === 0 || v.attributes.size === m.size) && (p.colours.length === 0 || v.attributes.colour === m.colour),
    ) ?? null
  );
}

/** '3-4 years' → '3-4y', '6-12 months' → '6-12m' — chips stay scannable in a row. */
function shortSize(s: string): string {
  return s.replace(' years', 'y').replace(' months', 'm');
}

function swatchColour(name: string): string {
  const map: Record<string, string> = { white: '#F7F2E8', blue: '#84BBD0', pink: '#E8A6B8' };
  return map[name] ?? '#E0C7A8';
}

/**
 * "Dress the whole family" — build a matching set (the SAME drawing on kids tees,
 * grown-up tees and a baby bodysuit) and add it to the basket in one tap. The 5%
 * family-set saving is decided SERVER-side at quote/checkout from line keys +
 * quantities; the figure shown here is the same rule, for honesty of expectation.
 */
export function FamilySetModal({
  open,
  onClose,
  products,
  upload,
  ensureAsset,
}: {
  open: boolean;
  onClose: () => void;
  products: CatalogueProduct[];
  upload: Upload;
  ensureAsset: () => Promise<string | null>;
}) {
  const add = useBasket((s) => s.add);
  const setQty = useBasket((s) => s.setQty);
  const items = useBasket((s) => s.items);
  const placements = usePlacements((s) => s.placements);

  const garments = useMemo(
    () => SET_MEMBERS.map(({ key, who }) => ({ who, product: products.find((p) => p.key === key) })).filter(
      (g): g is { who: string; product: CatalogueProduct } => Boolean(g.product),
    ),
    [products],
  );

  const uidRef = useRef(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [adding, setAdding] = useState(false);

  const memberFor = (p: CatalogueProduct): Member => {
    const def = p.variants.find((v) => v.isDefault) ?? p.variants[0]!;
    return { uid: ++uidRef.current, key: p.key, size: def.attributes.size ?? null, colour: def.attributes.colour ?? null };
  };

  // A fresh set each open: one kids tee + one grown-up tee, ready to grow.
  useEffect(() => {
    if (!open) return;
    setMembers(garments.filter((g) => g.product.key !== 'babyBodysuit').map((g) => memberFor(g.product)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, garments]);

  const rows = members.map((m) => {
    const product = garments.find((g) => g.product.key === m.key)?.product ?? null;
    const variant = product ? resolveVariant(product, m) : null;
    return { m, product, variant };
  });

  const count = rows.length;
  const totalPence = rows.reduce((n, r) => n + (r.variant?.pricePence ?? 0), 0);
  // The server counts garments across the WHOLE order (src/pricing/engine.ts) — mirror
  // that here so we never nudge someone to buy a piece the basket already qualifies with.
  const basketGarmentQty = items.reduce((n, i) => n + (isFamilySetKey(i.sku ?? i.product) ? i.qty : 0), 0);
  const qualifies = basketGarmentQty + count >= FAMILY_SET_MIN_QTY && count > 0;
  const stillNeeded = Math.max(0, FAMILY_SET_MIN_QTY - basketGarmentQty - count);
  const allResolved = rows.length > 0 && rows.every((r) => r.variant !== null);

  const patch = (uid: number, up: Partial<Member>) => setMembers((ms) => ms.map((m) => (m.uid === uid ? { ...m, ...up } : m)));
  const rowsRef = useRef<HTMLDivElement>(null);
  // Removing a row unmounts the focused button — hand focus to a stable neighbour
  // (next row's remove, else previous row's, else the first add button) so a keyboard
  // user never falls out of the dialog onto the page behind it.
  const removeMember = (uid: number) => {
    const rowEl = rowsRef.current?.querySelector(`[data-row="${uid}"]`);
    const target = (rowEl?.nextElementSibling?.querySelector('[data-remove]') ??
      rowEl?.previousElementSibling?.querySelector('[data-remove]') ??
      rowsRef.current?.querySelector('[data-add]')) as HTMLElement | null;
    setMembers((ms) => ms.filter((m) => m.uid !== uid));
    requestAnimationFrame(() => target?.focus());
  };

  const addSet = async () => {
    if (!allResolved || adding) return;
    setAdding(true);
    try {
      const assetId = await ensureAsset();
      if (!assetId) return; // ensureAsset already toasted
      for (const r of rows) {
        if (!r.product || !r.variant) continue;
        const id = lineIdForSku(r.variant.sku);
        const placement = placements[`${assetId}-${r.product.key}`] || DEFAULT_TF;
        const existing = useBasket.getState().items.find((i) => i.id === id);
        if (existing) {
          setQty(id, existing.qty + 1);
        } else {
          const sub = [r.variant.attributes.size, r.variant.attributes.colour].filter(Boolean).join(' · ') || undefined;
          add({
            id,
            name: r.product.label,
            product: r.product.key as ProductKey,
            sku: r.variant.sku,
            variantId: r.variant.id,
            pricePence: r.variant.pricePence,
            sub,
            artwork: { assetId, transform: placement, sourceObjectId: upload?.cutout?.sourceObjectId },
          });
        }
      }
      toast(qualifies ? 'family set added ✓ — 5% comes off at checkout' : 'set added to your basket ✓');
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="dress the whole family" subtitle="the same drawing, worn by everyone">
      <div ref={rowsRef} className="space-y-2.5">
        {rows.length === 0 ? (
          // success-but-empty: never a bare footer over a void
          <div className="rounded-2xl border border-dashed border-[#E0C7A8] bg-[#FBF8F1] p-5 text-center text-sm text-[#6F6358]">
            add someone below to start the set.
          </div>
        ) : null}

        {rows.map(({ m, product, variant }) => {
          if (!product) return null;
          const who = garments.find((g) => g.product.key === m.key)?.who;
          return (
            <div key={m.uid} data-row={m.uid} className="flex items-start gap-3 rounded-2xl border border-[#EADFC9] bg-[#FFFDF8] p-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#FBF5E9] p-1">
                <MockupPreview
                  productKey={product.key as ProductKey}
                  assetId={upload?.assetId ?? null}
                  variantId={variant?.id ?? null}
                  transform={DEFAULT_TF}
                  sourceObjectId={upload?.cutout?.sourceObjectId ?? null}
                  px={56}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-cocoa">
                    {product.label} <span className="text-[11px] font-semibold text-[#7A6A58]">{who}</span>
                  </span>
                  <span className="shrink-0 text-sm font-bold text-cocoa">{variant ? gbp(variant.pricePence) : '—'}</span>
                </div>
                {/* Chips keep their compact pill look; a pseudo-element extends each hit area
                    to ≥44px, and the row gaps are sized so the extensions never overlap. */}
                {product.sizes.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-x-2 gap-y-3.5" role="group" aria-label={`${product.label} size`}>
                    {product.sizes.map((s) => (
                      <Chip
                        key={s}
                        active={m.size === s}
                        onClick={() => patch(m.uid, { size: s })}
                        className="relative before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-['']"
                      >
                        {shortSize(s)}
                      </Chip>
                    ))}
                  </div>
                ) : null}
                {product.colours.length > 1 ? (
                  <div className="mt-3.5 flex flex-wrap gap-x-2 gap-y-3.5" role="group" aria-label={`${product.label} colour`}>
                    {product.colours.map((c) => (
                      <Chip
                        key={c}
                        active={m.colour === c}
                        onClick={() => patch(m.uid, { colour: c })}
                        className="relative before:absolute before:-inset-x-1 before:-inset-y-[7px] before:content-['']"
                      >
                        <span className="mr-1 inline-block h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: swatchColour(c) }} />
                        {c}
                      </Chip>
                    ))}
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                data-remove
                onClick={() => removeMember(m.uid)}
                aria-label={`remove this ${product.label}`}
                className="relative shrink-0 rounded-full p-1.5 text-[#B3A491] before:absolute before:-inset-[8px] before:content-[''] hover:text-berry"
              >
                <Icon icon={IconX} size={16} />
              </button>
            </div>
          );
        })}

        {/* Grow the set — one tap per family member */}
        <div className="flex flex-wrap gap-2">
          {garments.map((g, i) => (
            <Button key={g.product.key} variant="secondary" {...(i === 0 ? { 'data-add': true } : {})} onClick={() => setMembers((ms) => [...ms, memberFor(g.product)])}>
              <Icon icon={IconPlus} size={14} /> {g.product.label}
            </Button>
          ))}
        </div>

        {/* Totals + the honest saving line. The CTA shows the UNDISCOUNTED sum (what the
            basket footer will show); the saving is applied — and shown — at checkout,
            counted across the whole order, so the figures always agree screen to screen. */}
        <div className="rounded-2xl border border-[#EADFC9] bg-white p-3.5">
          <div className="flex items-center justify-between text-[13px] text-[#5F564C]">
            <span>
              {count} piece{count === 1 ? '' : 's'}
            </span>
            <span className="font-bold text-cocoa">{gbp(totalPence)}</span>
          </div>
          {qualifies ? (
            <p className="mt-1 text-[13px] font-semibold text-green-save">5% family set saving comes off all garments at checkout</p>
          ) : count > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[#7A6A58]">
              <Icon icon={IconShirt} size={14} className="text-honey" />
              add {stillNeeded} more piece{stillNeeded === 1 ? '' : 's'} and 5% comes off the whole set
            </p>
          ) : null}
          <Button size="lg" className="mt-3 w-full" onClick={addSet} disabled={!allResolved || adding}>
            {adding ? 'adding your set…' : `add the set to basket · ${gbp(totalPence)}`}
          </Button>
          <p className="mt-2 text-center text-[11px] text-[#6F6358]">organic cotton · free tracked delivery · savings confirmed at checkout</p>
        </div>
      </div>
    </Modal>
  );
}
