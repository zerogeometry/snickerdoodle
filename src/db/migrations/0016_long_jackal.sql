ALTER TABLE "orders" ADD COLUMN "prodigi_order_id" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_address" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipping_method" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tracking" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "submit_error" text;