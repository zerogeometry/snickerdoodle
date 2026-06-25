import { ProductArt, type ProductKey } from './ProductArt';

/** A line item in a cart / gift list — product thumbnail, name + sub, price. */
export function CartLineItem({
  product,
  name,
  sub,
  price,
}: {
  product: ProductKey;
  name: string;
  sub?: string;
  price: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#EADFC9] bg-white px-3 py-2.5">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[#EADFC9] bg-oat">
        <ProductArt product={product} size={30} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-bold text-cocoa">{name}</div>
        {sub ? <div className="truncate text-[11px] text-[#9C8E7E]">{sub}</div> : null}
      </div>
      <span className="text-[13px] font-bold text-cocoa">{price}</span>
    </div>
  );
}
