'use client';

import { StickerChip } from '@/ui/primitives/Chip';
import { Select, type SelectOption } from '@/ui/primitives/Select';
import { hasMultiBuy, tierFor } from '@/pricing/multibuy';

/**
 * MULTI-BUY (founder, 27 + 29 Oct): buy more of the same product, save more. The tiers are the product's
 * OWN, worked out on the server from its live costs (src/pricing/multibuy.ts) — so a product only says
 * "buy more, save more" when it can honestly keep the promise. The saving itself is applied by the
 * server's quote, never here.
 */

const pct = (bps: number) => `${Math.round(bps / 100)}%`;

/** The compact sticker on a basket line: "multi-buy −10%". */
export function MultiBuyChip({ bps }: { bps: number }) {
  return <StickerChip>multi-buy −{pct(bps)}</StickerChip>;
}

/** How many the dropdown offers. */
export const QTY_MAX = 10;

/**
 * The quantity options: each quantity on the left, the discount it earns on the right — from the
 * SERVER's tiers, counting `others` of the same product already in the basket (multi-buy counts the
 * product across lines). No offer → plain numbers, no notes.
 */
export function qtyOptions(tiers: readonly number[] | null | undefined, others = 0, max = QTY_MAX): Array<SelectOption<number>> {
  const offer = !!tiers && hasMultiBuy(tiers);
  return Array.from({ length: max }, (_, i) => {
    const q = i + 1;
    if (!offer) return { value: q, label: String(q) };
    const bps = tierFor(tiers!, others + q);
    return { value: q, label: String(q), note: bps > 0 ? `${pct(bps)} off` : 'full price', saving: bps > 0 };
  });
}

/**
 * "buy more, save more" + the quantity dropdown (founder, 29 Oct — the (i) popover is gone): each
 * option shows its discount. A product with no offer gets a plain "how many" and no notice.
 */
export function MultiBuyQty({
  tiers, value, onChange, productLabel, others = 0, compact = false,
}: {
  tiers: readonly number[] | null | undefined;
  value: number;
  onChange: (q: number) => void;
  productLabel: string;
  /** how many of the same product are already on OTHER basket lines */
  others?: number;
  /** the basket line's smaller version */
  compact?: boolean;
}) {
  const offer = !!tiers && hasMultiBuy(tiers);
  return (
    <div className={compact ? 'w-40' : 'mt-3 max-w-xs'}>
      {offer ? <p className="mb-1 text-xs font-bold lowercase text-cinnamon">buy more, save more</p> : null}
      <Select label={offer ? `how many ${productLabel} — buy more, save more` : `how many ${productLabel}`} hideLabel value={value} options={qtyOptions(tiers, others)} onChange={onChange} />
    </div>
  );
}
