import { MockupPreview } from './MockupPreview';
import { ProductArt } from './ProductArt';
import type { BasketItem } from '@/lib/store';

/**
 * A card-pack basket line's thumbnail: the REAL first card (its drawing on the 7×5 card) with a
 * little "×N" sticker for the pack size — falls back to the stacked-cards motif if the pack has no
 * preview variant. Decorative: the line's own text names it.
 */
export function CardPackThumb({ item, px }: { item: BasketItem; px: number }) {
  const first = item.cards?.[0];
  const n = item.cards?.length ?? 0;
  return (
    <div className="relative h-full w-full" aria-hidden>
      {first && item.previewVariantId ? (
        <MockupPreview
          productKey="card"
          assetId={first.assetId}
          variantId={item.previewVariantId}
          transform={first.transform}
          sourceObjectId={first.sourceObjectId ?? null}
          size="thumb"
          px={px}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ProductArt product="cardPack" size={Math.round(px * 0.7)} />
        </div>
      )}
      {n > 0 ? (
        <span className="absolute bottom-1 right-1 rounded-full border-2 border-cocoa bg-honey px-1.5 text-[10px] font-extrabold leading-4 text-cocoa">×{n}</span>
      ) : null}
    </div>
  );
}
