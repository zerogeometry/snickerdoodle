-- Snickerdoodle: what each live product costs us and what we keep (READ-ONLY).
--
-- It only reads. It changes nothing: it runs inside a read-only transaction and ends with ROLLBACK.
-- Paste the whole file where you usually run live database queries, then paste the three result tables back.
--
-- The money columns are in pounds. "product cost" and the two post columns come from the live
-- database (product_variants.unit_cost_pence / post_first_pence / post_extra_pence, loaded from
-- Prodigi's price sheets by scripts/ops/push-costs.sh). unit_cost_pence is LANDED: product + first post.
-- VAT is 20% of the ex-VAT price (the company is VAT-registered). Stripe is 1.5% + 20p of the price paid.
-- Profit = ex-VAT price - product cost - first post - Stripe. Nothing else is taken off here
-- (the "buy more & save" maths in src/pricing/multibuy.ts also keeps back 3% reprints, 5% for
-- codes and 55p running costs per order; those are in the report, not this query).
--
-- Never commit the RESULTS to the public repo: they are the real costs.

BEGIN TRANSACTION READ ONLY;

-- 1) One row per product + price + cost (variants that cost and sell the same are counted together).
WITH live AS (
  SELECT p.key                                   AS product,
         p.label                                 AS product_label,
         v.sku,
         v.attributes,
         v.price_pence,
         v.unit_cost_pence,
         v.post_first_pence,
         v.post_extra_pence,
         -- phone cases and mugs: one row per type, not one per phone model or mug colour
         CASE WHEN p.key = 'phoneCase' AND pvp.provider_sku LIKE '%-TCB-%' THEN 'tough case (all phones)'
              WHEN p.key = 'phoneCase' THEN 'snap case (all phones)'
              WHEN p.key = 'mug' THEN 'H-MUG-11OZ (all colours)'
              ELSE pvp.provider_sku END        AS provider_sku
  FROM products p
  JOIN product_variants v ON v.product_id = p.id
  LEFT JOIN product_variant_providers pvp ON pvp.variant_id = v.id AND pvp.is_default
  WHERE p.active AND v.active AND p.visible_in_shop
    -- a christmas bundle's extra packs: never sold on their own (src/lib/christmas-bundle.ts BUNDLE_ONLY_SKUS)
    AND v.sku NOT IN ('placemat-packof1', 'placemat-packof2', 'placemat-packof6', 'coaster-packof1')
)
SELECT product,
       coalesce(provider_sku, '(bundle)')                                         AS prodigi_sku,
       count(*)                                                                    AS variants,
       min(sku)                                                                    AS example_variant,
       CASE WHEN product = 'phoneCase' THEN '(every phone model)'
            ELSE string_agg(DISTINCT coalesce(attributes ->> 'size', ''), ', ') END AS sizes,
       string_agg(DISTINCT coalesce(attributes ->> 'colour', ''), ', ')            AS colours,
       round(price_pence / 100.0, 2)                                               AS price_inc_vat,
       round(price_pence / 1.2 / 100.0, 2)                                         AS price_ex_vat,
       round((price_pence - price_pence / 1.2) / 100.0, 2)                         AS vat_owed,
       round((unit_cost_pence - post_first_pence) / 100.0, 2)                      AS product_cost,
       round(post_first_pence / 100.0, 2)                                          AS post_first,
       round(post_extra_pence / 100.0, 2)                                          AS post_extra,
       round((0.015 * price_pence + 20) / 100.0, 2)                                AS stripe_fee,
       round((price_pence / 1.2 - unit_cost_pence - (0.015 * price_pence + 20)) / 100.0, 2) AS profit_one,
       round(100 * (price_pence / 1.2 - unit_cost_pence - (0.015 * price_pence + 20)) / (price_pence / 1.2), 0) AS profit_pct_ex_vat,
       CASE WHEN unit_cost_pence IS NULL THEN 'NO COST ON FILE'
            WHEN post_first_pence IS NULL OR post_extra_pence IS NULL THEN 'NO POST SPLIT'
            ELSE '' END                                                            AS note
FROM live
GROUP BY product, provider_sku, price_pence, unit_cost_pence, post_first_pence, post_extra_pence
ORDER BY product, price_pence, prodigi_sku;

-- 2) What has actually sold since the shop went public (13 Nov 2026): units and money per product,
--    real sales only (paid, not a sample, not fully refunded). Helps weigh which margins matter most.
--    A christmas bundle counts once per bundle (its pieces are folded back together).
--    A card pack's "printed_items" counts every card in it (a pack of 5 = 5).
SELECT coalesce(split_part(oi.bundle_key, '-', 1), oi.product_key)  AS product,
       sum(oi.qty)                                                   AS printed_items,
       count(DISTINCT o.id)                                          AS orders,
       count(DISTINCT CASE WHEN oi.bundle_key IS NOT NULL THEN o.id::text || oi.bundle_key END) AS bundles,
       round(sum(oi.line_pence) / 100.0, 2)                          AS goods_inc_vat_before_savings
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL
  AND o.paid_at >= '2026-11-13'
  AND NOT o.is_sample
  AND o.refunded_pence < o.total_pence
GROUP BY 1
ORDER BY orders DESC, printed_items DESC;

-- 3) The savings actually given on those orders, in total (so the report can show what "buy more & save",
--    same-parcel and codes really cost).
SELECT count(*)                                                      AS orders,
       round(sum(subtotal_pence) / 100.0, 2)                         AS goods_inc_vat,
       round(sum(multi_buy_saving_pence) / 100.0, 2)                 AS buy_more_save_given,
       round(sum(parcel_saving_pence) / 100.0, 2)                    AS same_parcel_given,
       round(sum(family_set_saving_pence) / 100.0, 2)                AS family_set_given,
       round(sum(promo_saving_pence) / 100.0, 2)                     AS codes_given,
       round(sum(partner_commission_pence) / 100.0, 2)               AS partner_commission_owed,
       round(sum(total_pence) / 100.0, 2)                            AS paid_inc_vat,
       round(avg(total_pence) / 100.0, 2)                            AS average_order
FROM orders
WHERE paid_at IS NOT NULL
  AND paid_at >= '2026-11-13'
  AND NOT is_sample
  AND refunded_pence < total_pence;

ROLLBACK;
