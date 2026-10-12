CREATE TYPE "public"."partner_type" AS ENUM('INFLUENCER', 'PTA', 'REFERRAL', 'CAMPAIGN');--> statement-breakpoint
CREATE TYPE "public"."promo_kind" AS ENUM('PERCENT', 'FIXED');--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"kind" "promo_kind" NOT NULL,
	"value" integer NOT NULL,
	"min_spend_pence" integer DEFAULT 0 NOT NULL,
	"partner_name" text,
	"partner_type" "partner_type",
	"commission_bps" integer DEFAULT 0 NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"max_redemptions" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_code_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "promo_saving_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "partner_commission_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "unit_cost_pence" integer;--> statement-breakpoint
CREATE UNIQUE INDEX "promo_code_unique" ON "promo_codes" USING btree ("code");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_promo_code_id_promo_codes_id_fk" FOREIGN KEY ("promo_code_id") REFERENCES "public"."promo_codes"("id") ON DELETE set null ON UPDATE no action;