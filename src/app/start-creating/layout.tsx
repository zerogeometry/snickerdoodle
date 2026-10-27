import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { publicMetadata } from '@/lib/seo';

export const metadata: Metadata = publicMetadata({
  title: 'start creating',
  description: 'Snap or upload your little one’s drawing and see it made real on prints, mugs, cushions and more — in moments, no account needed.',
  path: '/start-creating',
});

export default function StartCreatingLayout({ children }: { children: ReactNode }) {
  return children;
}
