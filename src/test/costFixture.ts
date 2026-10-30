import { sql } from 'drizzle-orm';
import type { DbHandle } from '@/server/db';

/**
 * TEST-ONLY cost fixture for the pricing integration suites (multi-buy tiers, the promo margin guard).
 *
 * The real Prodigi landed costs (product_variants.unit_cost_pence + post_first/post_extra) are loaded
 * from the gitignored cost sheets by scripts/discount-headroom.mjs --write-costs (live:
 * scripts/ops/push-costs.sh). CI and fresh test databases have none — and this repo is public, so
 * the real numbers are never committed. Instead, a database with NO real costs gets SYNTHETIC ones:
 * product cost = 35% of the ex-VAT shelf price, post £4.49 first + £0.99 each extra, on every Prodigi
 * variant still without a cost. A database that already has real costs (any costed variant whose post
 * isn't the fixture's 449/99 pair) is never touched — so the dev database keeps its real numbers.
 *
 * Idempotent and safe to race (every suite that needs costs calls it after seedCatalogue).
 */
export const FIXTURE_POST_FIRST_PENCE = 449;
export const FIXTURE_POST_EXTRA_PENCE = 99;
/** Product cost as a percentage of the ex-VAT shelf price. */
const FIXTURE_COST_PCT = 35;

export async function ensureTestCosts(db: DbHandle): Promise<{ filled: number; realCosts: boolean }> {
  const [real] = (await db.execute(sql`
    select exists (
      select 1 from product_variants
      where unit_cost_pence is not null
        and (post_first_pence is distinct from ${FIXTURE_POST_FIRST_PENCE} or post_extra_pence is distinct from ${FIXTURE_POST_EXTRA_PENCE})
    ) as real`)) as unknown as Array<{ real: boolean }>;
  if (real?.real) return { filled: 0, realCosts: true };
  const filled = (await db.execute(sql`
    update product_variants v
    set unit_cost_pence = round(v.price_pence * ${FIXTURE_COST_PCT}::int / 120.0)::int + ${FIXTURE_POST_FIRST_PENCE},
        post_first_pence = ${FIXTURE_POST_FIRST_PENCE},
        post_extra_pence = ${FIXTURE_POST_EXTRA_PENCE}
    where v.unit_cost_pence is null
      and exists (select 1 from product_variant_providers p where p.variant_id = v.id and p.provider = 'PRODIGI')
    returning v.id`)) as unknown as unknown[];
  return { filled: filled.length, realCosts: false };
}
