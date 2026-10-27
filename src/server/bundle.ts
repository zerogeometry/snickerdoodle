import { AuthzError } from '@/authz';
import { bundleCounts, bundlePricePence, normalizeBundle, type BundleSpec } from '@/lib/christmas-bundle';
import type { DbHandle } from './db';
import { getViewableAssetOrThrow, resolveAssetViewer } from './assets';
import { getCatalogue } from './catalogue';

/**
 * The CHRISTMAS BUNDLE's add-to-basket check (founder, 27 Oct): EVERY drawing the shopper chose —
 * the table's, each ornament's, each sack's — passes the authz gate (assertCanViewAsset, via
 * getViewableAssetOrThrow) BEFORE it goes in the basket, as it will again at order time
 * (placeOrder). A keepsake they can see (buying access is enough to build from existing art), or
 * their own drawing in progress (its upload claim). New uploads only ever exist through the
 * contribute-gated ingest (hash-check + moderation, src/server/ingest.ts); an un-cleared drawing can
 * sit in a basket but never reaches a print order (placeOrder's moderation gate).
 *
 * Returns the server's own price for what will be made — the basket shows it, the order re-prices it.
 */
export async function checkBundle(
  db: DbHandle,
  input: { accountId: string | null; uploadClaims: string[]; bundle: unknown },
): Promise<{ ok: true; bundle: BundleSpec; pricePence: number } | { ok: false; reason: 'invalid' | 'not-allowed' }> {
  const b = normalizeBundle(input.bundle);
  if (!b) return { ok: false, reason: 'invalid' };
  const ids = [...new Set([b.table, ...b.ornaments, ...b.sacks].map((a) => a.assetId))];
  try {
    for (const id of ids) {
      const viewer = await resolveAssetViewer(db, id, input.accountId, input.uploadClaims);
      await getViewableAssetOrThrow(db, id, viewer); // ← assertCanViewAsset; throws on deny
    }
  } catch (e) {
    if (e instanceof AuthzError) return { ok: false, reason: 'not-allowed' };
    throw e;
  }
  const catalogue = await getCatalogue(db);
  const base = catalogue.christmasBundle?.pricePence;
  if (typeof base !== 'number') return { ok: false, reason: 'invalid' };
  return { ok: true, bundle: b, pricePence: bundlePricePence(bundleCounts(b), base) };
}
