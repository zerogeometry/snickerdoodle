import 'server-only';
import { AuthzError, type ViewerContext } from '@/authz';
import type { DbHandle } from '@/server/db';
import { getStorageObjectGrant } from '@/server/assets';
import { composeMockup, NoMockupTemplateError, type ComposeMemo, type MockupSize } from './compositor';
import type { RawTransform } from './geometry';

/** Most previews one batch may ask for (a whole range is a handful of batches, in parallel).
 * Client-safe copies of this live in src/lib/mockupPrefetch.ts. */
export const MOCKUP_BATCH_MAX = 12;

/** The compose result shape — shared by the mockup routes and the MockupPreview that calls them. */
export type MockupPreviewResult =
  | { ok: true; url: string; tier: 'FLAT' | 'PERSPECTIVE'; widthPx?: number; heightPx?: number }
  | { ok: false; needsAuth?: boolean; fallback: true };

/** One preview request as the client sends it — every field untrusted (validated / clamped here
 * and inside composeMockup). */
export interface MockupRequestBody {
  assetId?: unknown;
  variantId?: unknown;
  transform?: unknown;
  size?: unknown;
  sourceObjectId?: unknown;
  view?: unknown;
  fill?: unknown;
  ground?: unknown;
  spanHalf?: unknown;
}

/** The asset this request is for, or null when it's malformed. */
export const requestAssetId = (b: MockupRequestBody): string | null =>
  typeof b.assetId === 'string' && typeof b.variantId === 'string' ? b.assetId : null;

/**
 * Compose one preview for an ALREADY-RESOLVED viewer (composeMockup re-runs the authz gate on
 * every call) and mint a 10-minute signed URL for it. "No template yet" is the expected steady
 * state for a product without a photo — silent; anything else is logged, then the fallback.
 *
 * `refreshViewer` covers one race: a preview that set off for a guest DRAFT (viewer = its upload
 * claim) can land just after "+ keepsake" filed that draft into the family — adopted in place, the
 * claim retired — so the claim-only viewer is (rightly) refused. The viewer is then looked up again,
 * the same server-side way, and the compose tried once more; it goes through the same gate, so a
 * viewer who isn't in the family still gets the fallback.
 */
export async function composeForViewer(
  db: DbHandle,
  viewer: ViewerContext,
  b: MockupRequestBody,
  opts: { needsAuth: boolean; memo?: ComposeMemo; refreshViewer?: () => Promise<ViewerContext> },
): Promise<MockupPreviewResult> {
  if (typeof b.assetId !== 'string' || typeof b.variantId !== 'string') return { ok: false, fallback: true };
  try {
    try {
      return await composeAndSign(db, viewer, b, b.assetId, b.variantId, opts.memo);
    } catch (err) {
      if (!(err instanceof AuthzError) || viewer.uploadClaim == null || !opts.refreshViewer) throw err;
      const fresh = await opts.refreshViewer();
      if (fresh.uploadClaim != null) throw err; // still a draft: the refusal stands
      return await composeAndSign(db, fresh, b, b.assetId, b.variantId, opts.memo);
    }
  } catch (err) {
    if (!(err instanceof NoMockupTemplateError)) {
      console.warn('[mockup] compose failed, serving fallback:', err instanceof Error ? err.message : err);
    }
    return { ok: false, needsAuth: opts.needsAuth, fallback: true };
  }
}

async function composeAndSign(
  db: DbHandle,
  viewer: ViewerContext,
  b: MockupRequestBody,
  assetId: string,
  variantId: string,
  memo: ComposeMemo | undefined,
): Promise<MockupPreviewResult> {
  const res = await composeMockup(db, viewer, {
    assetId,
    variantId,
    transform: (b.transform ?? {}) as RawTransform, // untrusted; clamped server-side
    size: (typeof b.size === 'string' ? b.size : undefined) as MockupSize | undefined,
    sourceObjectId: typeof b.sourceObjectId === 'string' ? b.sourceObjectId : undefined,
    view: typeof b.view === 'string' ? b.view : undefined,
    fill: typeof b.fill === 'string' ? b.fill : undefined,
    ground: typeof b.ground === 'string' ? b.ground : undefined, // normalised to a known token in composeMockup
    spanHalf: b.spanHalf === 'front' || b.spanHalf === 'back' ? b.spanHalf : undefined,
    memo,
  });
  const grant = await getStorageObjectGrant(db, res.mockupObjectId, viewer, 600);
  return { ok: true, url: grant.url, tier: res.tier, widthPx: res.widthPx, heightPx: res.heightPx };
}
