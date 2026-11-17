-- The free first card is the shop's one welcome (founder, 17 Nov 2026): the FIRSTCARD code, first-order-only,
-- applied by checkout itself for a signed-in buyer's first paid order (src/server/promos.ts). It can be
-- switched off on /admin/codes like any code. Parents' personal referral codes are retired: switched off here
-- (checkout refuses them anyway). Credit already earned stays on the ledger.
INSERT INTO "promo_codes" ("code", "kind", "value", "min_spend_pence", "commission_bps", "first_order_only", "active")
VALUES ('FIRSTCARD', 'FREE_CARD', 0, 0, 0, true, true)
ON CONFLICT ("code") DO NOTHING;--> statement-breakpoint
UPDATE "promo_codes" SET "active" = false WHERE "partner_type" = 'REFERRAL';
