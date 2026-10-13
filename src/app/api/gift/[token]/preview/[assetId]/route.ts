import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { giftLinkPreview } from '@/server/giftLinks';

/**
 * A gift-link item's preview image: small, re-encoded, gated by the link's capability (see
 * giftLinkPreview). Anything not allowed is a plain 404 — no hint whether the link or the
 * keepsake exists. Private, short cache; never indexed.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string; assetId: string }> }) {
  const { token, assetId } = await params;
  const headers = { 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
  let img: Buffer | null = null;
  try {
    img = await giftLinkPreview(getDb(), token, assetId);
  } catch {
    img = null;
  }
  if (!img) return new NextResponse(null, { status: 404, headers: { ...headers, 'cache-control': 'no-store' } });
  return new NextResponse(new Uint8Array(img), {
    headers: { ...headers, 'content-type': 'image/webp', 'cache-control': 'private, max-age=300' },
  });
}
