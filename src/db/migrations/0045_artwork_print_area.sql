ALTER TABLE "order_item_artwork" ADD COLUMN "print_area" text;--> statement-breakpoint
CREATE UNIQUE INDEX "artwork_item_area_unique" ON "order_item_artwork" USING btree ("order_item_id",coalesce("print_area", ''));--> statement-breakpoint
ALTER TABLE "order_item_artwork" DROP CONSTRAINT "order_item_artwork_order_item_id_unique";