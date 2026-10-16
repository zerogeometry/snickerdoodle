import { getDb } from '@/db/client';
import { AuthzError } from '@/authz';
import { currentReviewer } from '@/server/admin/context';
import { reviewImage, type ReviewKind } from '@/server/admin/review';

/**
 * A flagged picture, for a reviewer who chose to look. Admin + two-step login only (canReview);
 * the look is written to the audit log before a byte is sent; never cached anywhere.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ kind: string; id: string }> }): Promise<Response> {
  const { kind, id } = await ctx.params;
  if (kind !== 'keepsake' && kind !== 'profile') return new Response('not found', { status: 404 });
  try {
    const img = await reviewImage(getDb(), await currentReviewer(), kind as ReviewKind, id);
    return new Response(new Uint8Array(img.bytes), {
      headers: { 'content-type': img.contentType, 'cache-control': 'no-store, private', 'x-robots-tag': 'noindex', 'referrer-policy': 'no-referrer' },
    });
  } catch (e) {
    if (e instanceof AuthzError) return new Response('not found', { status: 404 });
    throw e;
  }
}
