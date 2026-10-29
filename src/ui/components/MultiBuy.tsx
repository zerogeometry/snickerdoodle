'use client';

import { IconInfoCircle, IconPlus } from '@tabler/icons-react';
import { useState } from 'react';
import { StickerChip } from '@/ui/primitives/Chip';
import { Icon } from '@/ui/primitives/Icon';
import { Modal } from '@/ui/primitives/Modal';

/**
 * MULTI-BUY (founder, 27 Oct): buy more of the same product, save more. The tiers are the product's
 * OWN, worked out on the server from its live costs (src/pricing/multibuy.ts) — so a product only says
 * "buy more, save more" when it can honestly keep the promise. The saving itself is applied at checkout.
 */

const pct = (bps: number) => `${Math.round(bps / 100)}%`;

/** The compact sticker on a basket line: "multi-buy −10%". */
export function MultiBuyChip({ bps }: { bps: number }) {
  return <StickerChip>multi-buy −{pct(bps)}</StickerChip>;
}

/** "add 1 more — both 15% off" / "add 1 more — all 3 10% off". */
export const nudgeText = (nextQty: number, bps: number) => `add 1 more — ${nextQty === 2 ? 'both' : `all ${nextQty}`} ${pct(bps)} off`;

/**
 * "add one more and save" (founder, 29 Oct): ONE small line under a checkout line whose product would
 * reach a better multi-buy tier with one more. The figures are the SERVER's (quoteBasket's nudges —
 * the engine that charges, re-run with one more), never worked out here. One tap adds another of the
 * same design. Small and warm: no countdown, nothing pre-ticked; the caller renders nothing when
 * there's no better tier. A real button — keyboard-operable, labelled, a 44px tap target.
 */
export function MultiBuyNudgeLine({ nextQty, bps, productLabel, onAdd }: { nextQty: number; bps: number; productLabel: string; onAdd: () => void }) {
  const text = nudgeText(nextQty, bps);
  return (
    <button
      type="button"
      onClick={onAdd}
      aria-label={`add one more ${productLabel} — ${nextQty === 2 ? 'both' : `all ${nextQty}`} ${pct(bps)} off`}
      className="press -ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-full px-1 text-left text-[12px] font-bold lowercase text-green-save hover:text-cocoa focus-visible:outline-2"
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-current bg-paper" aria-hidden>
        <Icon icon={IconPlus} size={12} />
      </span>
      {text}
    </button>
  );
}

/**
 * The customize page's small line: "buy more, save more" + an (i) button (tap / keyboard, labelled —
 * never hover) opening that product's tiers in a small card (a bottom sheet on phones).
 * Renders nothing when every tier is 0 (no offer).
 */
export function MultiBuyNotice({ tiers, productLabel, subtitle }: { tiers: readonly number[] | null | undefined; productLabel: string; subtitle?: string }) {
  const [open, setOpen] = useState(false);
  if (!tiers?.some((t) => t > 0)) return null;
  const rows: Array<[string, string]> = [['1', 'full price'], ...tiers.map((t, i): [string, string] => [i === tiers.length - 1 ? `${i + 2}+` : String(i + 2), t > 0 ? `${pct(t)} off` : 'full price'])];
  return (
    <>
      <p className="mt-2 flex items-center gap-1 text-xs font-bold lowercase text-cinnamon">
        buy more, save more
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="how the multi-buy saving works"
          className="relative flex h-6 w-6 items-center justify-center rounded-full text-cocoa before:absolute before:-inset-[10px] before:content-[''] hover:text-cinnamon focus-visible:outline-2"
        >
          <Icon icon={IconInfoCircle} size={16} />
        </button>
      </p>
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="buy more, save more" subtitle={subtitle ?? `more than one ${productLabel}? any drawings, any sizes`}>
        <table className="w-full text-sm text-cocoa">
          <caption className="sr-only">the multi-buy saving for {productLabel}, by how many you get</caption>
          <thead>
            <tr className="text-left text-[11px] font-extrabold uppercase tracking-wide text-ink-soft">
              <th scope="col" className="pb-1.5">how many</th>
              <th scope="col" className="pb-1.5 text-right">you save</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, save]) => (
              <tr key={n} className="border-t-2 border-dashed border-cocoa/10">
                <th scope="row" className="py-1.5 text-left font-bold">{n}</th>
                <td className={`py-1.5 text-right font-extrabold ${save === 'full price' ? 'text-ink-soft' : 'text-green-save'}`}>{save}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 pb-2 text-xs text-ink-soft">taken off at checkout. it doesn’t add to codes or the family saving — you always get whichever saves you more.</p>
      </Modal>
    </>
  );
}
