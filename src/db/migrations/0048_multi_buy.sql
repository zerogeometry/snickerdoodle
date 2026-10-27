ALTER TABLE "orders" ADD COLUMN "multi_buy_saving_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "post_first_pence" integer;--> statement-breakpoint
ALTER TABLE "product_variants" ADD COLUMN "post_extra_pence" integer;