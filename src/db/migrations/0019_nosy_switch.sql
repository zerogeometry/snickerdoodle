CREATE TABLE "mockup_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"variant_id" uuid NOT NULL,
	"view" text NOT NULL,
	"template_version" integer DEFAULT 1 NOT NULL,
	"material_class" "material_class" DEFAULT 'PAPER' NOT NULL,
	"blank_object_id" uuid,
	"print_quad" jsonb,
	"mask_object_id" uuid,
	"overlay_object_id" uuid,
	"print_width_px" integer NOT NULL,
	"print_height_px" integer NOT NULL,
	"map_resolution_px" integer DEFAULT 1500 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mockup_views" ADD CONSTRAINT "mockup_views_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockup_views" ADD CONSTRAINT "mockup_views_blank_object_id_template_assets_id_fk" FOREIGN KEY ("blank_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockup_views" ADD CONSTRAINT "mockup_views_mask_object_id_template_assets_id_fk" FOREIGN KEY ("mask_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mockup_views" ADD CONSTRAINT "mockup_views_overlay_object_id_template_assets_id_fk" FOREIGN KEY ("overlay_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mockup_views_variant_view_uq" ON "mockup_views" USING btree ("variant_id","view");