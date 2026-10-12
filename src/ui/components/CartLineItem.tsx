import { IconX } from '@tabler/icons-react';
import { ProductArt, type ProductKey } from './ProductArt';
import { Icon } from '../primitives/Icon';

/** A line item in a cart / gift list — product thumbnail, name + sub, price. */
export function CartLineItem({
  product,
  name,
  sub,
  price,
  onRemove,
}: {
  product: ProductKey;
  name: string;
  sub?: string;
  price: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] border-2 border-cocoa/10 bg-paper px-3 py-2.5">
      <div className="flex h-11 w-11 shrink-0 -rotate-2 items-center justify-center rounded-[10px] border-2 border-cocoa/15 bg-paper-2">
        <ProductArt product={product} size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-cocoa">{name}</div>
        {sub ? <div className="truncate text-[11px] text-ink-soft">{sub}</div> : null}
      </div>
      <span className="text-[13px] font-bold text-cocoa">{price}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="press relative ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-cocoa/20 text-cocoa before:absolute before:-inset-[6px] before:content-[''] hover:text-cinnamon"
        >
          <Icon icon={IconX} size={15} />
        </button>
      ) : null}
    </div>
  );
}
