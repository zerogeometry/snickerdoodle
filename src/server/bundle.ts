import { AuthzError } from '@/authz';
import { bundleSizeOf, coasterArt, normalizeBundle, type BundleSize, type BundleSpec } from '@/lib/christmas-bundle';
import type { DbHandle } from './db';
import { getViewableAssetOrThrow, resolveAssetViewer } from './assets';
import { getCatalogue } from './catalogue';

/**
 * The CHRISTMAS BUNDLE's add-to-basket check (founder, 29 Oct): EVERY drawing the shopper chose — the
 * placemats', the coasters', each ornament's — passes the authz gate (assertCanViewAsset, via
 * getViewableAssetOrThrow) BEFORE it goes in the basket, as it will again at order time
 * (placeOrder). A keepsake they can see (buying access is enough to build from existing art), or
 * their own drawing in progress (its upload claim). New uploads only ever exist through the
 * contribute-gated ingest (hash-check + moderation, src/server/ingest.ts); an un-cleared drawing can
 * sit in a basket but never reaches a print order (placeOrder's moderation gate).
 *
 * Returns the server's own price for the size — its variant's catalogue price. The basket shows it,
 * the order re-prices it.
 */
export async function checkBundle(
  db: DbHandle,
  input: { accountId: string | null; uploadClaims: string[]; sku: unknown; bundle: unknown },
): Promise<{ ok: true; size: BundleSize; bundle: BundleSpec; pricePence: number } | { ok: false; reason: 'invalid' | 'not-allowed' }> {
  const n = typeof input.sku === 'string' ? bundleSizeOf(input.sku) : null;
  const b = n ? normalizeBundle(input.bundle, n) : null;
  if (!n || !b) return { ok: false, reason: 'invalid' };
  const ids = [...new Set([b.placemat, coasterArt(b), ...b.ornaments].map((a) => a.assetId))];
  try {
    for (const id of ids) {
      const viewer = await resolveAssetViewer(db, id, input.accountId, input.uploadClaims);
      await getViewableAssetOrThrow(db, id, viewer); // ← assertCanViewAsset; throws on deny
    }
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false, reason: 'not-allowed' };
    throw e;
  }
  const price = (await getCatalogue(db))[input.sku as string]?.pricePence;
  if (typeof price !== 'number') return { ok: false, reason: 'invalid' };
  return { ok: true, size: n, bundle: b, pricePence: price };
}
