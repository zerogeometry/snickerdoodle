CREATE TYPE "public"."credit_reason" AS ENUM('REFERRAL_REWARD', 'SPENT', 'ADJUSTMENT');--> statement-breakpoint
CREATE TABLE "account_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"delta_pence" integer NOT NULL,
	"reason" "credit_reason" NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "buyer_email" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "credit_applied_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "class_label" text;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "owner_account_id" uuid;--> statement-breakpoint
ALTER TABLE "promo_codes" ADD COLUMN "first_order_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_credits" ADD CONSTRAINT "account_credits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_account_idx" ON "account_credits" USING btree ("account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_once_per_order_reason" ON "account_credits" USING btree ("order_id","reason","account_id");--> statement-breakpoint
ALTER TABLE "promo_codes" ADD CONSTRAINT "promo_codes_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;