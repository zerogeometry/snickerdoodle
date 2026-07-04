ALTER TYPE "public"."product_category" ADD VALUE IF NOT EXISTS 'FESTIVE' BEFORE 'ADDON';--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "family_set_saving_pence" integer DEFAULT 0 NOT NULL;
