import { type NextRequest } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { mockupViews, productVariants, templateAssets } from '@/db/schema';
import { templateBytes, PHOTO_ONLY_VIEWS } from '@/server/print/compositor';

/**
 * A product PHOTO shown as authored — e.g. the placemat's cork underside (founder, 29 Oct: "the back").
 * Brand-safe template assets only (never a drawing, never anything of a child): `GET ?product=placemat&view=back`,
 * whitelisted by PHOTO_ONLY_VIEWS. 404 until the seed has stored it.
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  const product = req.nextUrl.searchParams.get('product') ?? '';
  const view = req.nextUrl.searchParams.get('view') ?? '';
  if (!PHOTO_ONLY_VIEWS[product]?.includes(view)) return new Response(null, { status: 404 });
  const [row] = await getDb()
    .select({ key: templateAssets.key, type: templateAssets.contentType })
    .from(mockupViews)
    .innerJoin(productVariants, eq(productVariants.id, mockupViews.variantId))
    .innerJoin(templateAssets, eq(templateAssets.id, mockupViews.blankObjectId))
    .where(and(eq(productVariants.sku, product), eq(mockupViews.view, view)));
  if (!row) return new Response(null, { status: 404 });
  const bytes = await templateBytes(row.key);
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': row.type ?? 'image/webp', 'cache-control': 'public, max-age=3600' } });
}
