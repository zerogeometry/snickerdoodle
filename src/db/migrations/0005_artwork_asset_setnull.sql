ALTER TABLE "order_item_artwork" DROP CONSTRAINT "order_item_artwork_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "order_item_artwork" ALTER COLUMN "asset_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;