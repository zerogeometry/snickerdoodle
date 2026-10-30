import type { PricedCatalogue } from '@/pricing';

/**
 * What each gift-list line costs TODAY. A link freezes WHAT is offered (the keepsake on its product),
 * but checkout always charges the live catalogue price (placeGiftLinkOrder → placeOrder re-prices,
 * never trusting a stored figure) — so the page shows that price on every line too, and the lines
 * always add up to the total (06-B3). A product no longer priced keeps its shared price on show.
 */
export function withLivePrices<T extends { productKey: string; unitPricePence: number }>(items: readonly T[], catalogue: PricedCatalogue): T[] {
  return items.map((i) => ({ ...i, unitPricePence: catalogue[i.productKey]?.pricePence ?? i.unitPricePence }));
}
