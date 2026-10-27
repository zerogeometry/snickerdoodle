import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { publicMetadata } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'the keepsake range',
  description: 'Framed prints, mugs, cushions, jigsaws, blankets, tees and cards — every one made from your little one’s own drawing.',
  path: '/catalogue',
});

export default function CatalogueLayout({ children }: { children: ReactNode }) {
  return children;
}
