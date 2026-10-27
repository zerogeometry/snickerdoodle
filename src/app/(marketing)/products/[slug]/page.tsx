import { IconArrowLeft, IconCircleCheck, IconRefresh, IconShieldCheck, IconTruckDelivery } from '@tabler/icons-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createPathFor } from '@/lib/shop-products';
import { siteOrigin } from '@/lib/seo';
import { gbp, shopListingBySlug } from '@/server/shop/listing';
import { productJsonLd } from '@/server/shop/structuredData';
import { Button } from '@/ui/primitives/Button';
import { CaveatNote } from '@/ui/primitives/CaveatNote';
import { Icon } from '@/ui/primitives/Icon';
import { ChristmasPromise } from '@/ui/components/ChristmasPromise';
import { JsonLd } from '@/ui/components/JsonLd';
import { ProductArt } from '@/ui/components/ProductArt';
import { ThumbCta } from '@/ui/components/ThumbCta';

/**
 * /products/<slug> (C7) — the PUBLIC page for one product: what it is, what it costs (the server
 * catalogue), how it's delivered and returned, a brand-safe photo, and Product structured data. It's
 * the landing page for search and for Merchant Center (`?v=<sku>` picks a price group, as the feed's
 * links do). There is no family data here: the drawing a family makes it with lives behind
 * /start-creating → /customize, which stay noindex and closed to crawlers.
 * Only products ON SHOW have a page; anything else is a 404.
 */
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ v?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const l = shopListingBySlug((await params).slug);
  if (!l) return {};
  const description = `${l.description} From ${gbp(l.fromPence)}, made to order in the UK, with free UK delivery.`;
  return {
    title: l.title,
    description,
    alternates: { canonical: l.path },
    openGraph: { title: `${l.title} — Snickerdoodle`, description, url: l.path, type: 'website', ...(l.image ? { images: [{ url: l.image.src, width: l.image.width, height: l.image.height, alt: l.image.alt }] } : {}) },
  };
}

export default async function ProductPage({ params, searchParams }: Props) {
  const l = shopListingBySlug((await params).slug);
  if (!l) notFound();
  const v = (await searchParams).v;
  const chosen = l.offers.find((o) => o.sku === (Array.isArray(v) ? v[0] : v));
  const site = siteOrigin();
  const [h0, h1] = l.delivery.handling;
  const [t0, t1] = l.delivery.transit;

  return (
    <>
      <JsonLd data={productJsonLd(l, site)} />

      <div className="mx-auto max-w-5xl px-6 pb-16 pt-6 md:pt-10">
        <Link href="/" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-cinnamon">
          <Icon icon={IconArrowLeft} size={16} /> snickerdoodle
        </Link>

        <div className="mt-2 grid items-start gap-8 md:grid-cols-[1fr_1.1fr] md:gap-12">
          <figure className="polaroid tape mx-auto w-full max-w-[420px]" style={{ ['--tilt' as string]: '-2deg' }}>
            <div className="relative flex aspect-square items-center justify-center overflow-hidden bg-paper-2">
              {l.image ? (
                <Image src={l.image.src} alt={l.image.alt} fill sizes="(min-width: 768px) 420px, 90vw" className="object-cover" priority />
              ) : (
                <ProductArt product={l.key} size={220} />
              )}
            </div>
            <figcaption className="pt-2 text-center text-[12px] text-ink-faint">{l.image ? 'made from a sample drawing — yours will be their own' : 'your drawing goes here'}</figcaption>
          </figure>

          <div>
            <CaveatNote className="-rotate-1 text-[24px] leading-none">{l.blurb}</CaveatNote>
            <h1 className="mt-2 font-display text-[34px] leading-[1.05] text-cocoa md:text-[44px]">{l.title}</h1>
            <p className="mt-3 text-[26px] font-extrabold text-cocoa">
              {chosen ? (
                <>
                  {gbp(chosen.pricePence)}
                  {chosen.label ? <span className="ml-2 text-[15px] font-bold text-ink-soft">{chosen.label}</span> : null}
                </>
              ) : (
                <>
                  {l.offers.length > 1 ? <span className="text-[16px] font-bold text-ink-soft">from </span> : null}
                  {gbp(l.fromPence)}
                </>
              )}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[13px] font-bold text-green-save">
              <Icon icon={IconTruckDelivery} size={16} /> {l.tracked ? 'free tracked UK delivery' : 'free UK delivery'} — it’s in the price
            </p>
            <div className="mt-3">
              <ChristmasPromise productKey={l.key} />
            </div>

            <p className="mt-5 text-[16px] leading-relaxed text-ink-soft">{l.description}</p>

            {l.offers.length > 1 ? (
              <table className="mt-5 w-full border-collapse text-left text-[14px]">
                <caption className="sr-only">Prices for the {l.name}</caption>
                <thead>
                  <tr className="border-b-2 border-cocoa/15 text-[12px] uppercase tracking-wide text-ink-faint">
                    <th scope="col" className="py-2 font-extrabold">
                      option
                    </th>
                    <th scope="col" className="py-2 text-right font-extrabold">
                      price
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {l.offers.map((o) => (
                    <tr key={o.sku} className={`border-b border-cocoa/10 ${chosen?.sku === o.sku ? 'bg-honey-band' : ''}`}>
                      <td className="py-2 pl-1 text-cocoa">{o.label}</td>
                      <td className="py-2 pr-1 text-right font-bold text-cocoa">{gbp(o.pricePence)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {Object.keys(l.specs).length > 0 ? (
              <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-[16px] border-2 border-cocoa/15 bg-paper p-4 text-[14px]">
                {Object.entries(l.specs).map(([k, val]) => (
                  <div key={k} className="contents">
                    <dt className="font-extrabold text-cocoa">{k}</dt>
                    <dd className="text-ink-soft">{val}</dd>
                  </div>
                ))}
              </dl>
            ) : null}

            <ul className="mt-5 space-y-2 text-[14px] leading-snug text-ink-soft">
              <li className="flex items-start gap-2">
                <Icon icon={IconCircleCheck} size={17} className="mt-px shrink-0 text-green-save" />
                <span>
                  made to order in the UK in {h0}–{h1} working days, then {t0}–{t1} days in the post
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icon icon={IconRefresh} size={17} className="mt-px shrink-0 text-green-save" />
                <span>
                  made just for you, so no change-of-mind returns — but if it arrives faulty or damaged, we reprint it free.{' '}
                  <Link href="/faq#returns" className="font-bold text-cinnamon underline underline-offset-2">
                    returns
                  </Link>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <Icon icon={IconShieldCheck} size={17} className="mt-px shrink-0 text-green-save" />
                <span>your child’s drawing stays private — nothing is ever public</span>
              </li>
            </ul>

            <div className="mt-7 hidden md:block">
              <Button href={createPathFor(l.key)} size="lg" attention>
                start creating
              </Button>
              <p className="mt-2 text-[13px] text-ink-soft">upload a drawing, see it on the {l.name} in moments — no account needed to look</p>
            </div>
          </div>
        </div>
      </div>

      <ThumbCta href={createPathFor(l.key)} label="start creating" note={`see their drawing on the ${l.name} in moments`} />
    </>
  );
}
