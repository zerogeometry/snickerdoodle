import { BUNDLE_ONLY_SKUS } from '@/lib/christmas-bundle';
import { offerUrl } from './structuredData';
import { shopListings, type ShopListing } from './listing';

/**
 * The Google Merchant Center product feed (C8) — free listings in the UK. RSS 2.0 with Google's `g:`
 * namespace, generated per request from the server listing, so it can never disagree with the shop:
 *  - only products ON SHOW; one item per PRICE GROUP (a frame size, snap vs tough) — never one per
 *    phone model or frame colour; groups of one product share an item_group_id;
 *  - prices from the server catalogue; free UK delivery (GB, £0) with handling + transit days;
 *  - images: the brand-safe marketing photo only (src/lib/shop-products.ts) — a product without one
 *    is left out rather than shown with anything else (as is one whose copy says `feed.exclude`);
 *  - grouped items say what sets them apart (size, or a phone case's build); clothing says colour,
 *    size, age group + gender, as Google requires in the UK;
 *  - custom_label_0 = christmas for the Christmas lead range (src/lib/season.ts).
 * Holiday cut-offs are set in Merchant Center itself (the founder), not here.
 */

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const el = (name: string, value: string | number) => `<g:${name}>${esc(String(value))}</g:${name}>`;

export interface FeedItem {
  id: string;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  pricePence: number;
  itemGroupId: string | null;
  /** What sets this item apart within its group ('' when it stands alone). */
  label: string;
  listing: ShopListing;
}

/** The items the feed lists (pure — the XML is just these, escaped). */
export function merchantFeedItems(origin: string): FeedItem[] {
  return shopListings()
    .filter((l) => l.image && !l.feed?.exclude)
    .flatMap((l) =>
      // belt and braces: the listing already leaves a bundle's extra packs out (never sold on their own)
      l.offers.filter((o) => !BUNDLE_ONLY_SKUS.has(o.sku)).map((o) => ({
        id: o.sku,
        title: (o.label ? `${l.title} — ${o.label}` : l.title).slice(0, 150),
        description: `${l.description} Made to order in the UK from your own child’s drawing, with free UK delivery.`.slice(0, 5000),
        link: offerUrl(origin, l, o),
        imageLink: `${origin}${l.image!.src}`,
        pricePence: o.pricePence,
        itemGroupId: l.offers.length > 1 ? l.key : null,
        label: o.label,
        listing: l,
      })),
    );
}

/** The feed's XML. */
export function buildMerchantFeed(origin: string): string {
  const items = merchantFeedItems(origin).map((it) => {
    const l = it.listing;
    const lines = [
      el('id', it.id),
      el('title', it.title),
      el('description', it.description),
      el('link', it.link),
      el('image_link', it.imageLink),
      el('availability', 'in_stock'),
      el('price', `${(it.pricePence / 100).toFixed(2)} GBP`),
      el('condition', 'new'),
      el('brand', 'Snickerdoodle'),
      el('identifier_exists', 'no'),
      el('google_product_category', l.googleCategory.id),
      el('product_type', l.productType),
      ...(it.itemGroupId ? [el('item_group_id', it.itemGroupId)] : []),
      // a grouped item must say what sets it apart: the frame size, the roll length … (phone cases: the build)
      ...(it.itemGroupId && it.label ? [el(l.key === 'phoneCase' ? 'material' : 'size', it.label)] : []),
      ...(l.feed?.size ? [el('size', l.feed.size)] : []),
      ...(l.feed?.color ? [el('color', l.feed.color)] : []),
      ...(l.feed?.ageGroup ? [el('age_group', l.feed.ageGroup)] : []),
      ...(l.feed?.gender ? [el('gender', l.feed.gender)] : []),
      el('is_bundle', 'no'),
      el('min_handling_time', l.delivery.handling[0]),
      el('max_handling_time', l.delivery.handling[1]),
      `<g:shipping>${el('country', 'GB')}${el('service', l.tracked ? 'Free tracked delivery' : 'Free delivery')}${el('price', '0.00 GBP')}${el('min_transit_time', l.delivery.transit[0])}${el('max_transit_time', l.delivery.transit[1])}</g:shipping>`,
      ...(l.christmas ? [el('custom_label_0', 'christmas')] : []),
    ];
    return `    <item>\n      ${lines.join('\n      ')}\n    </item>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '  <channel>',
    '    <title>Snickerdoodle</title>',
    `    <link>${esc(origin)}</link>`,
    '    <description>Keepsakes and gifts made from your child’s drawings — made to order in the UK, free UK delivery.</description>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}
