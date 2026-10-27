import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { PLAIN_SEGMENT, productPagePath } from '@/lib/seo';
import { shopFrontProducts } from '@/server/catalogue';

/**
 * Search metadata for a product page (the page itself is a client component). A product ON SHOW is
 * one of the shop's front doors (founder, 26 Oct: maximum reach) — its own title, description and
 * canonical URL (query strings, e.g. a basket line being edited, fold into it). The page shows the
 * product, never a child's picture: a parent's upload lives only in their browser. Anything else —
 * a hidden or paused product, an unknown key — says noindex.
 */
export async function generateMetadata({ params }: { params: Promise<{ productKey: string }> }): Promise<Metadata> {
  const { productKey } = await params;
  const product = PLAIN_SEGMENT.test(productKey) ? shopFrontProducts().find((p) => p.key === productKey) : undefined;
  if (!product) return { robots: { index: false, follow: false } };
  const path = productPagePath(product.key);
  const title = `${product.label}, made from your child’s drawing`;
  return {
    title,
    description: product.description,
    alternates: { canonical: path },
    openGraph: { title: `${title} · snickerdoodle`, description: product.description, url: path, type: 'website' },
  };
}

export default function CustomizeProductLayout({ children }: { children: ReactNode }) {
  return children;
}
