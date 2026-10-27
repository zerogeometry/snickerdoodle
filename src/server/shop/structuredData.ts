import type { OfferGroup, ShopListing } from './listing';

/**
 * Product structured data for the PUBLIC product pages (/products/<slug>) — C7. Built only from the
 * server listing (prices from the catalogue, never a client) and the brand-safe photo in
 * src/lib/shop-products.ts. Never on a family page: /customize, /studio, gift links and checkout are
 * noindex + closed to crawlers, and carry no markup.
 *
 * One price → a Product with one Offer. Several prices → a ProductGroup whose variants are the
 * price groups (Google's documented shape for variants), each with its own Offer + URL.
 */

const SCHEMA = 'https://schema.org';

/** Free UK delivery, with handling (making it) + transit (the carrier) in working days. */
export function shippingDetails(l: Pick<ShopListing, 'delivery'>) {
  const days = ([min, max]: [number, number]) => ({ '@type': 'QuantitativeValue', minValue: min, maxValue: max, unitCode: 'DAY' });
  return {
    '@type': 'OfferShippingDetails',
    shippingRate: { '@type': 'MonetaryAmount', value: 0, currency: 'GBP' },
    shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' },
    deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: days(l.delivery.handling), transitTime: days(l.delivery.transit) },
  };
}

/** Personalised = made for you: no change-of-mind returns; faulty or damaged → reprinted free. */
export function returnPolicy(origin: string) {
  return {
    '@type': 'MerchantReturnPolicy',
    applicableCountry: 'GB',
    returnPolicyCategory: `${SCHEMA}/MerchantReturnNotPermitted`,
    itemDefectReturnFees: `${SCHEMA}/FreeReturn`,
    merchantReturnLink: `${origin}/faq#returns`,
    description: 'Every piece is personalised and made to order, so it can’t be returned for a change of mind. If anything arrives faulty or damaged, we reprint it free — your statutory rights are unaffected.',
  };
}

export const offerUrl = (origin: string, l: Pick<ShopListing, 'path' | 'offers'>, o: OfferGroup): string =>
  l.offers.length > 1 ? `${origin}${l.path}?v=${encodeURIComponent(o.sku)}` : `${origin}${l.path}`;

function offer(origin: string, l: ShopListing, o: OfferGroup) {
  return {
    '@type': 'Offer',
    url: offerUrl(origin, l, o),
    sku: o.sku,
    price: (o.pricePence / 100).toFixed(2),
    priceCurrency: 'GBP',
    availability: `${SCHEMA}/InStock`,
    itemCondition: `${SCHEMA}/NewCondition`,
    seller: { '@type': 'Organization', '@id': `${origin}/#organization`, name: 'Snickerdoodle', url: origin },
    shippingDetails: shippingDetails(l),
    hasMerchantReturnPolicy: returnPolicy(origin),
  };
}

const VARIES_BY: Record<string, string> = { size: `${SCHEMA}/size`, colour: `${SCHEMA}/color` };

/** The JSON-LD for one public product page. */
export function productJsonLd(l: ShopListing, origin: string) {
  const brand = { '@type': 'Brand', name: 'Snickerdoodle' };
  const image = l.image ? [`${origin}${l.image.src}`] : undefined;
  const base = { name: l.title, description: l.description, brand, ...(image ? { image } : {}), category: l.googleCategory.path };

  if (l.offers.length === 1) {
    return { '@context': SCHEMA, '@type': 'Product', '@id': `${origin}${l.path}#product`, url: `${origin}${l.path}`, sku: l.offers[0]!.sku, ...base, offers: offer(origin, l, l.offers[0]!) };
  }
  const varies = [...new Set(l.offers.flatMap((o) => Object.keys(o.shared)))].map((a) => VARIES_BY[a]).filter(Boolean);
  return {
    '@context': SCHEMA,
    '@type': 'ProductGroup',
    '@id': `${origin}${l.path}#product`,
    url: `${origin}${l.path}`,
    productGroupID: l.key,
    ...base,
    ...(varies.length ? { variesBy: varies } : {}),
    hasVariant: l.offers.map((o) => ({
      '@type': 'Product',
      sku: o.sku,
      name: o.label ? `${l.title} — ${o.label}` : l.title,
      ...(image ? { image } : {}),
      ...(o.shared.size && l.key !== 'phoneCase' ? { size: o.shared.size } : {}),
      ...(o.shared.colour ? { color: o.shared.colour } : {}),
      offers: offer(origin, l, o),
    })),
  };
}

/** Safe inside a <script> tag: no "</script>" can close it early. */
export const jsonLdText = (data: unknown): string => JSON.stringify(data).replace(/</g, '\\u003c');
