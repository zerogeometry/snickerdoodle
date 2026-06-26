CREATE TYPE "public"."fit_mode" AS ENUM('CONTAIN', 'COVER');--> statement-breakpoint
CREATE TYPE "public"."fulfillment_state" AS ENUM('PENDING', 'RENDERING', 'RENDER_FAILED', 'READY', 'SUBMITTED', 'IN_PRODUCTION', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'BLOCKED_GATE', 'ERROR');--> statement-breakpoint
CREATE TYPE "public"."orientation" AS ENUM('PORTRAIT', 'LANDSCAPE', 'SQUARE');--> statement-breakpoint
CREATE TYPE "public"."product_category" AS ENUM('PRINT', 'MUG', 'APPAREL', 'CUSHION', 'BLANKET', 'BOOK', 'PUZZLE', 'BAG', 'CARD', 'ADDON');--> statement-breakpoint
CREATE TYPE "public"."provider_slug" AS ENUM('PRODIGI', 'MANUAL');--> statement-breakpoint
CREATE TABLE "order_item_artwork" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_item_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"controller_account_id" uuid NOT NULL,
	"template_snapshot" jsonb NOT NULL,
	"transform" jsonb NOT NULL,
	"source_object_id" uuid,
	"print_object_id" uuid,
	"rendered_dpi" integer,
	"upscaled" boolean DEFAULT false NOT NULL,
	"status" "fulfillment_state" DEFAULT 'PENDING' NOT NULL,
	"render_error" text,
	"provider_item_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_item_artwork_order_item_id_unique" UNIQUE("order_item_id")
);
--> statement-breakpoint
CREATE TABLE "print_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"orientation" "orientation" NOT NULL,
	"print_width_mm" integer NOT NULL,
	"print_height_mm" integer NOT NULL,
	"bleed_mm" integer DEFAULT 3 NOT NULL,
	"safe_inset_mm" integer DEFAULT 5 NOT NULL,
	"required_dpi" integer DEFAULT 300 NOT NULL,
	"print_width_px" integer NOT NULL,
	"print_height_px" integer NOT NULL,
	"aspect_milli" integer NOT NULL,
	"fit_mode" "fit_mode" DEFAULT 'CONTAIN' NOT NULL,
	"min_source_width_px" integer NOT NULL,
	"min_source_height_px" integer NOT NULL,
	CONSTRAINT "print_templates_variant_id_unique" UNIQUE("variant_id")
);
--> statement-breakpoint
CREATE TABLE "product_variant_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"provider" "provider_slug" NOT NULL,
	"provider_sku" text NOT NULL,
	"provider_config" jsonb,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" text NOT NULL,
	"label" text NOT NULL,
	"price_pence" integer NOT NULL,
	"currency" text DEFAULT 'GBP' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_variants_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"category" "product_category" NOT NULL,
	"label" text NOT NULL,
	"blurb" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "variant_id" uuid;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_controller_account_id_accounts_id_fk" FOREIGN KEY ("controller_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_source_object_id_storage_objects_id_fk" FOREIGN KEY ("source_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_artwork" ADD CONSTRAINT "order_item_artwork_print_object_id_storage_objects_id_fk" FOREIGN KEY ("print_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variant_providers" ADD CONSTRAINT "product_variant_providers_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artwork_asset_idx" ON "order_item_artwork" USING btree ("asset_id");--> statement-breakpoint
CREATE INDEX "artwork_status_idx" ON "order_item_artwork" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "variant_provider_unique" ON "product_variant_providers" USING btree ("variant_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "variant_default_provider" ON "product_variant_providers" USING btree ("variant_id") WHERE "product_variant_providers"."is_default";--> statement-breakpoint
CREATE INDEX "variant_product_idx" ON "product_variants" USING btree ("product_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;