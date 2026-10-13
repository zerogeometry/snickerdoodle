import { NextResponse, type NextRequest } from 'next/server';
import { getDb } from '@/db/client';
import { readProfileImage } from '@/server/profile';
import { getCurrentAccount } from '@/server/session';

/**
 * A profile picture / header / family banner — ONLY for people allowed to see it
 * (canViewProfileImage: yourself, or someone in a family with you; banners for that family's
 * members). Everything else is a plain 404 (no hint whether it exists). Private cache, noindex.
 */
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const headers = { 'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' };
  const account = await getCurrentAccount();
  let img: { bytes: Buffer; contentType: string } | null = null;
  try {
    if (/^[0-9a-f-]{36}$/i.test(id)) img = await readProfileImage(getDb(), id, account?.id ?? null);
  } catch {
    img = null;
  }
  if (!img) return new NextResponse(null, { status: 404, headers: { ...headers, 'cache-control': 'no-store' } });
  // the url changes whenever the image does (new id), so a short private cache is safe
  return new NextResponse(new Uint8Array(img.bytes), { headers: { ...headers, 'content-type': img.contentType, 'cache-control': 'private, max-age=600' } });
}
