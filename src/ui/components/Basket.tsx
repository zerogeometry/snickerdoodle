'use client';

import { IconInfoCircle, IconMinus, IconPlus, IconTrash } from '@tabler/icons-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/ui/primitives/Icon';
import { CardPackThumb } from './CardPackThumb';
import { MockupPreview } from './MockupPreview';
import { ProductArt, type ProductKey } from './ProductArt';
import { gbp, isPackLine, useBasket, type BasketItem } from '@/lib/store';

/**
 * The slim vertical basket down the right of the Start-Creating catalogue — a clear
 * running log of every saved creation. Each line is a compact card: the ACTUAL creation
 * (drawing on the chosen variant, at its saved placement) with a −qty+ and price beneath.
 * The name + variant are tucked behind an (i) on the thumbnail (float/tap to reveal) so
 * the column stays narrow. Tapping the thumbnail re-opens Customize to edit that line.
 * Quantity lives here, not on the catalogue tiles; dropping below 1 removes the line.
 */
function BasketRow({ item, index }: { item: BasketItem; index: number }) {
  const setQty = useBasket((s) => s.setQty);
  const remove = useBasket((s) => s.remove);
  const router = useRouter();
  // A card pack is always ONE pack (qty fixed): it shows its card count + a remove, not − / +.
  const pack = isPackLine(item);
  const [infoOpen, setInfoOpen] = useState(false);
  // A personalised line renders its ACTUAL creation; an add-on with no artwork falls
  // back to the stylised motif.
  const personalised = Boolean(item.artwork && item.variantId);
  const label = pack ? `${item.name} · ${item.cards?.length ?? 0} cards` : item.sub ? `${item.name}, ${item.sub}` : item.name;
  // Editing re-opens Customize for THIS line (carries its variant + placement) and swaps
  // the CTA to "update basket".
  const edit = () => router.push(`/customize/${item.product}?edit=${encodeURIComponent(item.id)}`);
  return (
    <li className="pop-in rounded-[14px] border-2 border-cocoa/20 bg-paper p-1.5" style={{ ['--i' as string]: Math.min(index, 6) }}>
      <div className="relative aspect-square w-full overflow-hidden rounded-[10px] bg-paper-2">
        {pack ? (
          <CardPackThumb item={item} px={150} />
        ) : personalised ? (
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
          className="peer/info absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border-[1.5px] border-cocoa bg-paper text-cocoa before:absolute before:-inset-[10px] before:content-[''] hover:text-cinnamon"
        >
          <Icon icon={IconInfoCircle} size={14} />
        </button>
        {/* Overlay stays WITHIN the card (the scroll container clips), so no pop-out clash. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-cocoa/85 px-2 text-center opacity-0 transition-opacity duration-150 peer-hover/info:opacity-100 peer-focus/info:opacity-100 ${infoOpen ? '!opacity-100' : ''}`}
        >
          <span className="text-[11px] font-bold leading-tight text-paper">{item.name}</span>
          {item.sub ? <span className="text-[10px] leading-tight text-paper">{item.sub}</span> : null}
        </div>
      </div>
      {pack ? (
        <div className="mt-1.5 flex items-stretch rounded-full border-2 border-cocoa/25 bg-paper">
          <span className="flex flex-1 items-center justify-center text-[11px] font-bold text-cocoa">{item.cards?.length ?? 0} cards</span>
          <button
            type="button"
            aria-label={`remove ${label}`}
            onClick={() => remove(item.id)}
            className="press flex h-11 w-11 items-center justify-center rounded-r-full text-ink-soft hover:text-cinnamon"
          >
            <Icon icon={IconTrash} size={14} />
          </button>
        </div>
      ) : (
        // −qty+ beneath, spanning the thumbnail width. − at 1 removes the line. The buttons fill
        // the row height (44px) and split its width, so the tap targets stay ≥44px tall even
        // though the basket column is deliberately slim.
        <div className="mt-1.5 flex items-stretch rounded-full border-2 border-cocoa/25 bg-paper">
          <button
            type="button"
            aria-label={`one fewer ${item.name}`}
            onClick={() => setQty(item.id, item.qty - 1)}
            className="press flex h-11 flex-1 items-center justify-center rounded-l-full text-cocoa"
          >
            <Icon icon={IconMinus} size={14} />
          </button>
          <span className="flex min-w-6 items-center justify-center text-xs font-bold text-cocoa">{item.qty}</span>
          <button
            type="button"
            aria-label={`one more ${item.name}`}
            onClick={() => setQty(item.id, item.qty + 1)}
            className="press flex h-11 flex-1 items-center justify-center rounded-r-full text-cinnamon"
          >
            <Icon icon={IconPlus} size={14} />
          </button>
        </div>
      )}
      <div className="mt-1 text-center text-xs font-extrabold text-cocoa">{gbp(item.pricePence * item.qty)}</div>
    </li>
  );
}

export function Basket({ className = '' }: { className?: string }) {
  const items = useBasket((s) => s.items);
  return (
    <aside className={`flex flex-col overflow-hidden rounded-[18px] border-2 border-cocoa bg-paper-2 shadow-[0_3px_0_var(--color-cocoa)] ${className}`} aria-label="your basket">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b-2 border-cocoa/10 bg-honey-band px-3 py-2.5">
        <h2 className="font-display text-sm text-cocoa">your basket</h2>
        <span className="text-[11px] font-semibold text-ink-soft">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-3 py-6 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-cocoa/30 text-ink-soft" aria-hidden>
            <Icon icon={IconPlus} size={18} />
          </span>
          <p className="text-[12px] leading-relaxed text-ink-soft">
            nothing added yet — tap <b className="text-cinnamon">+ customize</b> to place your art and it&apos;ll appear here.
          </p>
        </div>
      ) : (
        <ul className="brand-scroll min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
          {items.map((item, i) => (
            <BasketRow key={item.id} item={item} index={i} />
          ))}
        </ul>
      )}
    </aside>
  );
}
