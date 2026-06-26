CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'PAID', 'FULFILLING', 'SHIPPED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price_pence" integer NOT NULL,
	"line_pence" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"account_id" uuid,
	"family_id" uuid,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"subtotal_pence" integer NOT NULL,
	"delivery_pence" integer NOT NULL,
	"join_saving_pence" integer DEFAULT 0 NOT NULL,
	"total_pence" integer NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"is_gift" boolean DEFAULT false NOT NULL,
	"stripe_session_id" text,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "join_saving_consumed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_account_idx" ON "orders" USING btree ("account_id","created_at");