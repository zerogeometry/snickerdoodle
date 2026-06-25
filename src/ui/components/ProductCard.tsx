import { cn } from '../cn';
import { ProductArt, type ProductKey } from './ProductArt';

/**
 * A catalogue/preview card: the drawing shown on a product, with name + price.
 * Reused on Start Creating and the Catalogue.
 */
export function ProductCard({
  name,
  price,
  product,
  tint,
  featured = false,
  className,
}: {
  name: string;
  price: string;
  product: ProductKey;
  tint?: string;
  featured?: boolean;
  className?: string;
}) {
  return (
    <article
      className={cn(
        'overflow-hidden rounded-2xl border bg-[#FFFDF8] shadow-[0_2px_6px_rgba(46,39,35,.06)] transition-transform hover:-translate-y-0.5',
        featured ? 'border-2 border-honey' : 'border-[#EADFC9]',
        className,
      )}
    >
      <div
        className="flex h-28 items-center justify-center"
        style={tint ? { backgroundColor: tint } : undefined}
      >
        <ProductArt product={product} size={72} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-[#EFE6D6] px-3 py-2.5">
        <span className="text-sm font-bold text-cocoa">{name}</span>
        <span className="text-sm text-[#9C8E7E]">{price}</span>
      </div>
    </article>
  );
}
