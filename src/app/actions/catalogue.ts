'use server';

import { getDb } from '@/db/client';
import { loadCatalogue, type CatalogueProduct } from '@/server/catalogue';

/** The product catalogue (products grouped with their real variants) for the
 * catalogue grid + the Customize screen. Public, server-priced reference data.
 * Storefront-curated: only visibleInShop products — except the DEV curation view
 * (`includeHidden`), which is refused outright in production. */
export async function loadCatalogueAction(opts?: { includeHidden?: boolean }): Promise<CatalogueProduct[]> {
  const includeHidden = Boolean(opts?.includeHidden) && process.env.NODE_ENV !== 'production';
  return loadCatalogue(getDb(), { includeHidden });
}
