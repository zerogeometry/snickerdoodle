-- Sample orders at cost (founder, 25 Nov 2026): an admin who has done two-step login can order samples for
-- themself through the normal shop, priced at what they cost us (src/pricing/sample.ts, src/server/samples.ts).
-- Additive only. The new audit_event value is only ADDED here, never used in this transaction (Postgres can't use a
-- new enum value in the transaction that added it; drizzle-kit runs pending migrations in one).
ALTER TYPE "public"."audit_event" ADD VALUE 'SAMPLE_ORDER_PLACED';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "is_sample" boolean DEFAULT false NOT NULL;
