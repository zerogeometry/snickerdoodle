'use client';

import { IconInfoCircle, IconMinus, IconPlus } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { MockupPreview } from './MockupPreview';
import { ProductArt, type ProductKey } from './ProductArt';
import { gbp, useBasket, type BasketItem } from '@/lib/store';

/**
 * The slim vertical basket down the right of the Start-Creating catalogue — a clear
 * running log of every saved creation. Each line is a compact card: the ACTUAL creation
 * (drawing on the chosen variant, at its saved placement) with a −qty+ and price beneath.
 * The name + variant are tucked behind an (i) on the thumbnail (float/tap to reveal) so
 * the column stays narrow. Tapping the thumbnail re-opens Customize to edit that line.
 * Quantity lives here, not on the catalogue tiles; dropping below 1 removes the line.
 */
function BasketRow({ item }: { item: BasketItem }) {
  const setQty = useBasket((s) => s.setQty);
  const router = useRouter();
  const [infoOpen, setInfoOpen] = useState(false);
  // A personalised line renders its ACTUAL creation; an add-on with no artwork falls
  // back to the stylised motif.
  const personalised = Boolean(item.artwork && item.variantId);
  const label = item.sub ? `${item.name}, ${item.sub}` : item.name;
  // Editing re-opens Customize for THIS line (carries its variant + placement) and swaps
  // the CTA to "update basket".
  const edit = () => router.push(`/customize/${item.product}?edit=${encodeURIComponent(item.id)}`);
  return (
    <li className="rounded-xl border border-[#EFE6D6] bg-[#FFFDF8] p-1.5">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-[#FBF5E9]">
        {personalised ? (
          <MockupPreview
            productKey={item.product}
            assetId={item.artwork!.assetId}
            variantId={item.variantId}
            transform={item.artwork!.transform}
            sourceObjectId={item.artwork!.sourceObjectId}
            size="thumb"
            px={150}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ProductArt product={item.product as ProductKey} size={64} />
          </div>
        )}
        {/* Full-image tap target → edit this creation in Customize. */}
        <button type="button" onClick={edit} aria-label={`edit ${label}`} className="absolute inset-0" />
        {/* (i): reveals the name + variant (hover for pointers, tap toggles for touch); its
            aria-label carries the same text for screen readers. Sits above the edit target. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setInfoOpen((o) => !o);
          }}
          aria-label={label}
          className="peer/info absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white/85 text-[#7A6A58] shadow-sm hover:text-cinnamon"
        >
          <Icon icon={IconInfoCircle} size={14} />
        </button>
        {/* Overlay stays WITHIN the card (the scroll container clips), so no pop-out clash. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-cocoa/85 px-2 text-center opacity-0 transition-opacity duration-150 peer-hover/info:opacity-100 peer-focus/info:opacity-100 ${infoOpen ? '!opacity-100' : ''}`}
        >
          <span className="text-[11px] font-bold leading-tight text-oat">{item.name}</span>
          {item.sub ? <span className="text-[10px] leading-tight text-oat/85">{item.sub}</span> : null}
        </div>
      </div>
      {/* −qty+ and price beneath, spanning the thumbnail width. − at 1 removes the line. */}
      <div className="mt-1.5 flex items-center justify-between rounded-full border border-[#E6D8BE] bg-white px-0.5">
        <button
          type="button"
          aria-label={`one fewer ${item.name}`}
          onClick={() => setQty(item.id, item.qty - 1)}
          className="flex h-8 w-8 items-center justify-center text-[#7A6A58]"
        >
          <Icon icon={IconMinus} size={13} />
        </button>
        <span className="text-xs font-bold text-cocoa">{item.qty}</span>
        <button
          type="button"
          aria-label={`one more ${item.name}`}
          onClick={() => setQty(item.id, item.qty + 1)}
          className="flex h-8 w-8 items-center justify-center text-cinnamon"
        >
          <Icon icon={IconPlus} size={13} />
        </button>
      </div>
      <div className="mt-1 text-center text-[11px] font-bold text-cocoa">{gbp(item.pricePence * item.qty)}</div>
    </li>
  );
}

export function Basket({ className = '' }: { className?: string }) {
  const items = useBasket((s) => s.items);
  return (
    <aside className={`flex flex-col overflow-hidden rounded-2xl border border-[#EADFC9] bg-[#FBF7EE] ${className}`} aria-label="your basket">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-[#EADFC9] px-3 py-2.5">
        <h2 className="font-display text-sm font-semibold text-cocoa">your basket</h2>
        <span className="text-[11px] text-[#9C8E7E]">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-[#9C8772]">
          nothing added yet — tap <b className="text-cinnamon">+ customize</b> to place your art and it&apos;ll appear here.
        </p>
      ) : (
        <ul className="brand-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {items.map((item) => (
            <BasketRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </aside>
  );
}
