ALTER TABLE "orders" ADD COLUMN "gift_link_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gift_from_name" text;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_gift_link_id_gift_links_id_fk" FOREIGN KEY ("gift_link_id") REFERENCES "public"."gift_links"("id") ON DELETE set null ON UPDATE no action;