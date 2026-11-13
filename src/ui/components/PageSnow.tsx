'use client';
import { usePathname } from 'next/navigation';
import { showsPageSnow, snowPaper } from '@/lib/snow';
import { SnowLayer } from './Snowfall';

/**
 * The whole-background Christmas snow, mounted once in the root layout (so it keeps falling as a parent moves
 * between pages) and shown only on the pages in src/lib/snow.ts. It sits behind everything; while it's there,
 * the page wrappers marked `snow-clear` drop their own flat background so it shows through (globals.css). The
 * layer paints the page's paper itself (kraft on the marketing pages, oat in the app), so nothing else changes.
 */
export function PageSnow({ christmas }: { christmas: boolean }) {
  const pathname = usePathname();
  if (!showsPageSnow(pathname, christmas)) return null;
  return <SnowLayer scope="page" className={snowPaper(pathname ?? '') === 'kraft' ? 'kraft' : 'bg-oat'} />;
}
