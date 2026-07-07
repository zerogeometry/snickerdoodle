'use client';

import { IconMinus, IconPlus, IconX } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';
import { MockupPreview } from './MockupPreview';
import { ProductArt, type ProductKey } from './ProductArt';
import { gbp, useBasket, type BasketItem } from '@/lib/store';

/**
 * The vertical basket that sits down the right of the Start-Creating catalogue — a clear
 * running log of every saved creation (image + placement + product + variant) with a small
 * preview and a −qty+ stepper. Each customized creation is its OWN line, so the basket is
 * the ledger of exactly what will be made. Quantity is adjusted here, not on the catalogue
 * tiles (which now only "+ customize").
 */
function BasketRow({ item }: { item: BasketItem }) {
  const setQty = useBasket((s) => s.setQty);
  const remove = useBasket((s) => s.remove);
  // A personalised line renders its ACTUAL creation (the drawing on the chosen variant, at
  // its saved placement); an add-on with no artwork falls back to the stylised motif.
  const personalised = Boolean(item.artwork && item.variantId);
  return (
    <li className="flex gap-2.5 rounded-xl border border-[#EFE6D6] bg-[#FFFDF8] p-2">
      <div className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-lg bg-[#FBF5E9]">
        {personalised ? (
          <MockupPreview
            productKey={item.product}
            assetId={item.artwork!.assetId}
            variantId={item.variantId}
            transform={item.artwork!.transform}
            sourceObjectId={item.artwork!.sourceObjectId}
            size="thumb"
            px={52}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <ProductArt product={item.product as ProductKey} size={40} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-1.5">
          <span className="min-w-0 truncate text-[13px] font-bold text-cocoa">{item.name}</span>
          <button
            type="button"
            onClick={() => remove(item.id)}
            aria-label={`remove ${item.name}`}
            className="relative -mr-0.5 shrink-0 rounded-full p-0.5 text-[#B3A491] before:absolute before:-inset-[6px] before:content-[''] hover:text-berry"
          >
            <Icon icon={IconX} size={13} />
          </button>
        </div>
        {item.sub ? <div className="truncate text-[11px] text-[#9C8E7E]">{item.sub}</div> : null}
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex items-center rounded-full border border-[#E6D8BE] bg-white">
            <button type="button" aria-label={`one fewer ${item.name}`} onClick={() => setQty(item.id, item.qty - 1)} className="flex min-h-8 min-w-8 items-center justify-center text-[#7A6A58]">
              <Icon icon={IconMinus} size={12} />
            </button>
            <span className="min-w-4 text-center text-xs font-bold text-cocoa">{item.qty}</span>
            <button type="button" aria-label={`one more ${item.name}`} onClick={() => setQty(item.id, item.qty + 1)} className="flex min-h-8 min-w-8 items-center justify-center text-cinnamon">
              <Icon icon={IconPlus} size={12} />
            </button>
          </div>
          <span className="shrink-0 text-[12px] font-bold text-cocoa">{gbp(item.pricePence * item.qty)}</span>
        </div>
      </div>
    </li>
  );
}

export function Basket({ className = '' }: { className?: string }) {
  const items = useBasket((s) => s.items);
  return (
    <aside className={`flex flex-col rounded-2xl border border-[#EADFC9] bg-[#FBF7EE] ${className}`} aria-label="your basket">
      <div className="flex items-baseline justify-between gap-2 border-b border-[#EADFC9] px-3 py-2.5">
        <h2 className="font-display text-sm font-semibold text-cocoa">your basket</h2>
        <span className="text-[11px] text-[#9C8E7E]">{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-[12px] leading-relaxed text-[#9C8772]">
          nothing added yet — tap <b className="text-cinnamon">+ customize</b> to place your art and it&apos;ll appear here.
        </p>
      ) : (
        <ul className="brand-scroll flex-1 space-y-2 overflow-y-auto p-2.5">
          {items.map((item) => (
            <BasketRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </aside>
  );
}
