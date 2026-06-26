'use server';

import { eq } from 'drizzle-orm';
import { products, productVariants } from '@/db/schema';
import { getDb } from '@/db/client';
import { adoptEphemeralDraft } from '@/server/assets';
import { ensureHomeFamily } from '@/server/onboarding';
import { getCurrentAccount, getUploadClaims } from '@/server/session';
import { clampTransform, type RawTransform, type Transform } from '@/server/print/geometry';

export interface AdoptedLine {
  id: string;
  name: string;
  product: string;
  pricePence: number;
  variantId: string;
  artwork: { assetId: string; transform: Transform; sourceObjectId?: string };
}

/**
 * The keep moment after a guest signs in: adopt their ephemeral draft into their
 * family (so it's a real, kept, orderable keepsake) and return the server-priced
 * basket line for the placement they made, so checkout can proceed. The draft is
 * adopted only if the caller holds its upload claim.
 */
export async function adoptPendingPlacement(input: {
  assetId: string;
  variantId: string;
  transform: RawTransform;
  sourceObjectId?: string;
}): Promise<{ ok: true; line: AdoptedLine } | { ok: false; needsAuth?: boolean }> {
  const account = await getCurrentAccount();
  if (!account) return { ok: false, needsAuth: true };
  const claims = await getUploadClaims();
  const db = getDb();

  const familyId = await ensureHomeFamily(db, account.id, account.name);
  try {
    await adoptEphemeralDraft(db, account.id, familyId, input.assetId, claims);
  } catch {
    return { ok: false };
  }

  const [v] = await db
    .select({ variantId: productVariants.id, pricePence: productVariants.pricePence, key: products.key, label: products.label })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(productVariants.id, input.variantId));
  if (!v) return { ok: false };

  return {
    ok: true,
    line: {
      id: `pos-${input.assetId}-${input.variantId}`,
      name: v.label,
      product: v.key,
      pricePence: v.pricePence,
      variantId: v.variantId,
      artwork: { assetId: input.assetId, transform: clampTransform(input.transform), sourceObjectId: input.sourceObjectId },
    },
  };
}
