'use client';

import { IconPlus, IconShirt, IconX } from '@tabler/icons-react';
import Link from 'next/link';
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
import { FAMILY_SET_COLOURS, garmentHex } from '@/lib/garments';

const DEFAULT_TF = { scale: 0, offsetX: 0, offsetY: 0, rotationDeg: 0 }; // scale 0 = fit the WHOLE image

/** The garments a family set is built from, in display order, with warm row labels. */
const SET_MEMBERS: { key: string; who: string }[] = [
  { key: 'kidsTee', who: 'for the little artist' },
  { key: 'adultTee', who: 'for their biggest fan' },
  { key: 'babyBodysuit', who: 'for the littlest' },
];

type Member = { uid: number; key: string; size: string | null };

/** The baby bodysuit is made in white only — it joins a white set, and sits out a coloured one. */
const WHITE_ONLY = new Set(['babyBodysuit']);
const colourFor = (key: string, setColour: string) => (WHITE_ONLY.has(key) ? 'white' : setColour);

function resolveVariant(p: CatalogueProduct, m: Member, setColour: string): CatalogueVariant | null {
  const colour = colourFor(p.key, setColour);
  return (
    p.variants.find(
      (v) => (p.sizes.length === 0 || v.attributes.size === m.size) && (p.colours.length === 0 || v.attributes.colour === colour),
    ) ?? null
  );
}

/** '3-4 years' → '3-4y', '6-12 months' → '6-12m' — chips stay scannable in a row. */
function shortSize(s: string): string {
  return s.replace(' years', 'y').replace(' months', 'm');
}

// Real garment colours (product data, not brand styling); unknown → a token.
const swatchColour = (name: string): string => garmentHex(name) ?? 'var(--color-line)';

/**
 * "Dress the whole family" — build a matching set (the SAME drawing, in the SAME colour, on kids
 * tees, grown-up tees and — in white — a baby bodysuit) and add it to the basket in one tap. Each
 * person's preview is their own size, so the print shows true to scale on every tee. The 5%
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
  const [setColour, setSetColour] = useState<string>(FAMILY_SET_COLOURS[0] ?? 'white');
  const chooseColour = (c: string) => {
    setSetColour(c);
    // a coloured set: the white-only bodysuit sits out
    if (c !== 'white') setMembers((ms) => ms.filter((m) => !WHITE_ONLY.has(m.key)));
  };

  const memberFor = (p: CatalogueProduct): Member => {
    const def = p.variants.find((v) => v.isDefault) ?? p.variants[0]!;
    return { uid: ++uidRef.current, key: p.key, size: def.attributes.size ?? null };
  };

  // A fresh set each open: one kids tee + one grown-up tee, ready to grow.
  useEffect(() => {
    if (!open) return;
    setMembers(garments.filter((g) => g.product.key !== 'babyBodysuit').map((g) => memberFor(g.product)));
  }, [open, garments]);

  const rows = members.map((m) => {
    const product = garments.find((g) => g.product.key === m.key)?.product ?? null;
    const variant = product ? resolveVariant(product, m, setColour) : null;
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
    <Modal open={open} onClose={onClose} title="dress the whole family" subtitle="the same drawing, in the same colour, worn by everyone">
      <div ref={rowsRef} className="space-y-2.5">
        {/* One colour for the whole set — the colours every tee comes in */}
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-wide text-ink-faint">everyone in</p>
          <div className="mt-1.5 grid grid-cols-4 gap-2" role="radiogroup" aria-label="set colour">
            {FAMILY_SET_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={setColour === c}
                onClick={() => chooseColour(c)}
                className={`flex min-h-[64px] flex-col items-center justify-center gap-1 rounded-xl border-2 px-1 text-[11px] font-bold ${setColour === c ? 'border-cocoa bg-honey-band text-cocoa' : 'border-cocoa/15 bg-paper text-ink-soft hover:border-cocoa/50'}`}
              >
                <span aria-hidden className="h-6 w-6 rounded-full border border-black/15" style={{ backgroundColor: swatchColour(c) }} />
                {c}
              </button>
            ))}
          </div>
          {setColour !== 'white' && upload?.opaqueBg && !upload?.cutout ? (
            <p role="status" className="mt-2 rounded-xl border-2 border-cocoa bg-honey-band px-3 py-2 text-[12px] font-semibold text-cocoa">
              on a coloured tee the paper prints too —{' '}
              <Link href="/studio" className="text-cinnamon underline underline-offset-2">
                lift the drawing off the paper in the studio
              </Link>{' '}
              first.
            </p>
          ) : null}
          {setColour !== 'white' && garments.some((g) => WHITE_ONLY.has(g.product.key)) ? (
            <p className="mt-1.5 text-[11px] text-ink-soft">the baby bodysuit only comes in white — pick white to add one.</p>
          ) : null}
        </div>
        {rows.length === 0 ? (
          // success-but-empty: never a bare footer over a void
          <div className="rounded-2xl border border-dashed border-line bg-paper-2 p-5 text-center text-sm text-ink-soft">
            add someone below to start the set.
          </div>
        ) : null}

        {rows.map(({ m, product, variant }) => {
          if (!product) return null;
          const who = garments.find((g) => g.product.key === m.key)?.who;
          return (
            <div key={m.uid} data-row={m.uid} className="flex items-start gap-3 rounded-2xl border border-line bg-paper p-3">
              <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-oat p-1">
                <MockupPreview
                  productKey={product.key as ProductKey}
                  assetId={upload?.assetId ?? null}
                  variantId={variant?.id ?? null}
                  transform={DEFAULT_TF}
                  sourceObjectId={upload?.cutout?.sourceObjectId ?? null}
                  px={88}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-bold text-cocoa">
                    {product.label} <span className="text-[11px] font-semibold text-ink-soft">{who}</span>
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
                <p className="mt-1.5 text-[11px] text-ink-soft">{product.key === 'adultTee' ? 'a relaxed unisex fit' : product.key === 'kidsTee' ? 'print up to 26 × 26 cm' : 'long sleeves'}</p>
              </div>
              <button
                type="button"
                data-remove
                onClick={() => removeMember(m.uid)}
                aria-label={`remove this ${product.label}`}
                className="relative shrink-0 rounded-full p-1.5 text-ink-faint before:absolute before:-inset-[8px] before:content-[''] hover:text-berry"
              >
                <Icon icon={IconX} size={16} />
              </button>
            </div>
          );
        })}

        {/* Grow the set — one tap per family member */}
        <div className="flex flex-wrap gap-2">
          {garments.filter((g) => setColour === 'white' || !WHITE_ONLY.has(g.product.key)).map((g, i) => (
            <Button key={g.product.key} variant="secondary" {...(i === 0 ? { 'data-add': true } : {})} onClick={() => setMembers((ms) => [...ms, memberFor(g.product)])}>
              <Icon icon={IconPlus} size={14} /> {g.product.label}
            </Button>
          ))}
        </div>

        {/* Totals + the honest saving line. The CTA shows the UNDISCOUNTED sum (what the
            basket footer will show); the saving is applied — and shown — at checkout,
            counted across the whole order, so the figures always agree screen to screen. */}
        <div className="rounded-2xl border border-line bg-white p-3.5">
          <div className="flex items-center justify-between text-[13px] text-ink-soft">
            <span>
              {count} piece{count === 1 ? '' : 's'}
            </span>
            <span className="font-bold text-cocoa">{gbp(totalPence)}</span>
          </div>
          {qualifies ? (
            <p className="mt-1 text-[13px] font-semibold text-green-save">5% family set saving comes off all garments at checkout</p>
          ) : count > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-soft">
              <Icon icon={IconShirt} size={14} className="text-honey" />
              add {stillNeeded} more piece{stillNeeded === 1 ? '' : 's'} and 5% comes off the whole set
            </p>
          ) : null}
          <Button size="lg" className="mt-3 w-full" onClick={addSet} disabled={!allResolved || adding}>
            {adding ? 'adding your set…' : `add the set to basket · ${gbp(totalPence)}`}
          </Button>
          <p className="mt-2 text-center text-[11px] text-ink-soft">organic cotton · free tracked delivery · savings confirmed at checkout</p>
        </div>
      </div>
    </Modal>
  );
}
