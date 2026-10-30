'use client';

import { withArticle } from '@/lib/with-article';
import { IconPlus } from '@tabler/icons-react';
import { Icon } from '@/ui/primitives/Icon';
import { MockupPreview } from './MockupPreview';
import type { ProductKey } from './ProductArt';
import { basketDrawing } from '@/lib/complements';
import { basketLineId } from '@/lib/basket-line';
import { defaultPlacementFor } from '@/lib/catalogue-view';
import { gbp, toast, useBasket, useUpload, type BasketItem } from '@/lib/store';
import type { AddOn } from '@/server/addOns';
import { withArticle } from '@/lib/articles';

/**
 * CHECKOUT ADD-ONS (founder, 29 Oct): beneath the basket, up to three things that go with it, each
 * MADE WITH THE SHOPPER'S OWN DRAWING (the basket's — basketDrawing) through the usual authz-gated
 * mockup route, with a calm skeleton while it renders (never a stock photo). The saving is the
 * SERVER's (quoteBasket → src/server/addOns.ts): "£3 off — it comes in the same parcel", or nothing
 * claimed at all. "+" adds that product with that drawing at its default placement, and the basket
 * re-quotes. Small and warm: no countdowns, nothing pre-ticked.
 *
 * The "+" is ALWAYS shown (founder, 29 Oct — so it's clear these are on offer). A real, labelled, 44 px button.
 */

/** What "+" puts in the basket for an add-on made with `art` — the same placement its picture shows. */
export function addOnLine(a: AddOn, art: { assetId: string; sourceObjectId: string | null }, aspect?: number | null): Omit<BasketItem, 'qty'> {
  const fields = {
    name: a.label,
    product: a.productKey as ProductKey,
    sku: a.sku,
    variantId: a.variantId,
    pricePence: a.pricePence,
    sub: [a.attributes.size, a.attributes.colour].filter(Boolean).join(' · ') || undefined,
    artwork: { assetId: art.assetId, transform: defaultPlacementFor(a.productKey, a.attributes, aspect), ...(art.sourceObjectId ? { sourceObjectId: art.sourceObjectId } : {}) },
  };
  return { id: basketLineId(a.sku, fields), ...fields };
}

export function CheckoutAddOns({ addOns, items, gift }: { addOns: readonly AddOn[]; items: readonly BasketItem[]; gift: boolean }) {
  const add = useBasket((s) => s.add);
  const upload = useUpload((s) => s.upload);
  const art = basketDrawing(items);
  if (!art || addOns.length === 0) return null;
  const aspect = upload?.assetId === art.assetId ? upload.aspect : null;
  return (
    <section aria-labelledby="addons-title" className="mt-4">
      <h2 id="addons-title" className="text-[13px] font-extrabold lowercase text-cocoa">
        goes nicely with it — with the same drawing
      </h2>
      <ul className="mt-2 grid grid-cols-3 gap-2.5">
        {addOns.map((a) => {
          const line = addOnLine(a, art, aspect);
          return (
            <li key={a.productKey} className="group relative flex flex-col rounded-2xl border border-line bg-paper p-2">
              <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-oat">
                <MockupPreview
                  productKey={a.productKey as ProductKey}
                  assetId={art.assetId}
                  variantId={a.variantId}
                  transform={line.artwork!.transform}
                  sourceObjectId={art.sourceObjectId}
                  view={a.productKey === 'mug' ? 'centre' : undefined}
                  size="thumb"
                  px={120}
                />
                <button
                  type="button"
                  onClick={() => {
                    add(line);
                    toast(`${a.label} added ✓`);
                  }}
                  aria-label={`add ${withArticle(a.label)} with your drawing`}
                  className="press absolute bottom-1.5 right-1.5 flex h-11 w-11 items-center justify-center rounded-full border-2 border-cocoa bg-honey text-cocoa shadow-[0_2px_0_var(--color-cocoa)] focus-visible:outline-2"
                  data-addon-plus
                >
                  <Icon icon={IconPlus} size={18} />
                </button>
              </div>
              <p className="mt-1.5 text-[12px] font-extrabold lowercase leading-tight text-cocoa">{a.label}</p>
              {!gift ? <p className="text-[11px] font-bold text-ink-soft">{gbp(a.pricePence)}</p> : null}
              {a.savingPence > 0 ? <p className="text-[11px] font-bold leading-tight text-green-save">{gbp(a.savingPence)} off — it comes in the same parcel</p> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
