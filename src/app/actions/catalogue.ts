'use server';

import { getDb } from '@/db/client';
import { loadCatalogue, type CatalogueProduct } from '@/server/catalogue';

/** The product catalogue (products grouped with their real variants) for the
 * catalogue grid + the Customize screen. Public, server-priced reference data. */
export async function loadCatalogueAction(): Promise<CatalogueProduct[]> {
  return loadCatalogue(getDb());
}
