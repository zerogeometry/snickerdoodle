import { MockupPreview } from './MockupPreview';
import { ProductArt } from './ProductArt';
import { defaultTransformFor } from '@/lib/catalogue-view';
import type { BasketItem } from '@/lib/store';

/**
 * A christmas bundle basket line's thumbnail (the family bundle or the christmas eve bundle): its first ornament (or, with none, the table
 * drawing) on the REAL ceramic ornament, with a little sticker counting the pieces — falls back to the
 * bundle motif. Decorative: the line's own text names it (the sticker only where there's room for it).
 */
export function BundleThumb({ item, px }: { item: BasketItem; px: number }) {
  const b = item.bundle;
  const eve = item.eve;
  // the family bundle: its first ornament (else the table drawing); the christmas eve bundle: its ornament
  const art = b ? (b.ornaments[0] ?? b.table) : eve ? (eve.own.ceramicOrnament ?? eve.drawing) : null;
  const pieces = b ? 4 + b.extraPlacemats + 6 + b.extraCoasters + b.ornaments.length + b.sacks.length : eve ? 3 * item.qty : 0;
  return (
    <div className="relative h-full w-full" aria-hidden>
      {art && item.previewVariantId ? (
        <MockupPreview
          productKey="ceramicOrnament"
          assetId={art.assetId}
          variantId={item.previewVariantId}
          transform={defaultTransformFor('ceramicOrnament')}
          sourceObjectId={art.sourceObjectId ?? null}
          size="thumb"
          px={px}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ProductArt product="christmasBundle" size={Math.round(px * 0.7)} />
        </div>
      )}
      {pieces > 0 && px >= 100 ? (
        <span className="absolute bottom-1 right-1 rounded-full border-2 border-cocoa bg-honey px-1.5 text-[10px] font-extrabold leading-4 text-cocoa">{pieces} pieces</span>
      ) : null}
    </div>
  );
}
