import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { NOINDEX } from '@/lib/indexing';
import { publicMetadata } from '@/lib/seo';
import { shopFrontProducts } from '@/server/catalogue';

/**
 * Product pages are the best organic entry points, so each product ON SHOW gets its own title,
 * description and canonical. Anything else under /customize (a hidden/paused product, a typo)
 * is told to stay out of search.
 */
export async function generateMetadata({ params }: { params: Promise<{ productKey: string }> }): Promise<Metadata> {
  const { productKey } = await params;
  const product = shopFrontProducts().find((p) => p.key === productKey);
  if (!product) return { title: 'make it yours', robots: NOINDEX };
  return publicMetadata({
    title: `${product.label} made from your child’s drawing`,
    description: product.description,
    path: `/customize/${product.key}`,
  });
}

export default function CustomizeLayout({ children }: { children: ReactNode }) {
  return children;
}
