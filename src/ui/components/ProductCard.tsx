import { cn } from '../cn';
import { ProductArt, type ProductKey } from './ProductArt';

/**
 * A catalogue/preview card: the drawing shown on a product, with name + price.
 * When `image` (an uploaded data URL) is given, it shows the customer's real
 * drawing in place of the placeholder art. Optionally clickable.
 */
export function ProductCard({
  name,
  price,
  product,
  image,
  tint,
  featured = false,
  onClick,
  className,
}: {
  name: string;
  price: string;
  product: ProductKey;
  image?: string | null;
  tint?: string;
  featured?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? 'button' : 'article';
  return (
    <Tag
      {...(onClick ? { type: 'button' as const, onClick } : {})}
      className={cn(
        'block w-full overflow-hidden rounded-2xl border bg-paper text-left shadow-[0_2px_6px_color-mix(in_srgb,var(--color-cocoa)_6%,transparent)] transition-transform hover:-translate-y-0.5',
        featured ? 'border-2 border-honey' : 'border-line',
        className,
      )}
    >
      <div className="flex h-28 items-center justify-center" style={tint ? { backgroundColor: tint } : undefined}>
        {image ? (
          <img
            src={image}
            alt=""
            className="h-[72px] w-[72px] rounded-md border border-white object-cover shadow-sm"
          />
        ) : (
          <ProductArt product={product} size={72} />
        )}
      </div>
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5">
        <span className="text-sm font-bold text-cocoa">{name}</span>
        <span className="text-sm text-ink-faint">{price}</span>
      </div>
    </Tag>
  );
}
