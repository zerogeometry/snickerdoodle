import { BUNDLE_ONLY_SKUS } from '@/lib/christmas-bundle';
import { FAQ_PRODUCT_NAMES } from '@/lib/faq';
import { definedPriceList } from './catalogue';

/** Lowest live price per product in the shop (the catalogue is the one source of truth): the FAQ's price
 * table and sentence, and /llms.txt. */
export function faqFromPrices(): { key: string; name: string; pence: number }[] {
  const lowest = new Map<string, number>();
  for (const r of definedPriceList()) {
    if (!r.visibleInShop || r.paused || BUNDLE_ONLY_SKUS.has(r.sku)) continue; // a bundle's extra packs aren't sold alone
    lowest.set(r.productKey, Math.min(lowest.get(r.productKey) ?? Infinity, r.pricePence));
  }
  return Object.entries(FAQ_PRODUCT_NAMES)
    .filter(([key]) => lowest.has(key))
    .map(([key, name]) => ({ key, name, pence: lowest.get(key)! }));
}

export const gbp = (p: number) => `£${p % 100 ? (p / 100).toFixed(2) : p / 100}`;

/** "Framed print from £35; Mug from £18; …" */
export const faqPriceSentence = (prices = faqFromPrices()) => prices.map((p) => `${p.name} from ${gbp(p.pence)}`).join('; ');
