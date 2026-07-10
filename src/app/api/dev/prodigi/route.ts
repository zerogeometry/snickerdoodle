import { NextResponse, type NextRequest } from 'next/server';
import { getProduct } from '@/server/prodigi/client';

// DEV-ONLY: read a Prodigi product's print areas + attributes (metadata only — no image, no order).
// Used to verify the DUAL cushion print-area names against the real spec. 404 in production.
export async function GET(req: NextRequest): Promise<NextResponse> {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ ok: false }, { status: 404 });
  const skus = (req.nextUrl.searchParams.get('skus') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const out: Record<string, unknown> = {};
  for (const sku of skus) {
    try {
      const p = await getProduct(sku);
      out[sku] = p ? { description: p.description, printAreas: p.printAreas, attributes: p.attributes } : null;
    } catch (e) {
      out[sku] = { error: String(e) };
    }
  }
  return NextResponse.json({ ok: true, out });
}
