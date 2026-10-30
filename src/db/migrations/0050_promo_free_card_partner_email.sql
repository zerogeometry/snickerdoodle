ALTER TYPE "public"."promo_kind" ADD VALUE 'FREE_CARD';--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "partner_email" text;