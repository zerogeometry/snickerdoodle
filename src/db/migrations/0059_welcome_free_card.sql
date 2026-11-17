-- The free first card is the shop's one welcome (founder, 17 Nov 2026): the FIRSTCARD code, first-order-only,
-- applied by checkout itself for a signed-in buyer's first paid order (src/server/promos.ts). It can be
-- switched off on /admin/codes like any code. Parents' personal referral codes are retired: switched off here
-- (checkout refuses them anyway). Credit already earned stays on the ledger.
-- On a BRAND-NEW database (CI, a fresh dev box) every migration runs in one transaction, and Postgres won't let
-- 'FREE_CARD' (added by 0050 in that same transaction) be used yet — so there the insert is skipped and checkout
-- adds the row itself the first time it needs it (src/server/promos.ts ensureWelcomeCode). Live already has it.
DO $$ BEGIN
  INSERT INTO "promo_codes" ("code", "kind", "value", "min_spend_pence", "commission_bps", "first_order_only", "active")
  VALUES ('FIRSTCARD', 'FREE_CARD', 0, 0, 0, true, true)
  ON CONFLICT ("code") DO NOTHING;
EXCEPTION WHEN unsafe_new_enum_value_usage THEN NULL;
END $$;--> statement-breakpoint
UPDATE "promo_codes" SET "active" = false WHERE "partner_type" = 'REFERRAL';
