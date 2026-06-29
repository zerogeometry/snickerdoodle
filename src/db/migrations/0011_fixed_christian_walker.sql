CREATE TYPE "public"."material_class" AS ENUM('PAPER', 'LIGHT_FABRIC', 'DARK_FABRIC', 'CERAMIC', 'GLOSS');--> statement-breakpoint
CREATE TYPE "public"."template_asset_kind" AS ENUM('BLANK', 'MASK', 'LIGHTING', 'TEXTURE', 'DISPLACEMENT');--> statement-breakpoint
CREATE TABLE "template_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "template_asset_kind" NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text,
	"byte_size" bigint,
	"sha256" text,
	"width_px" integer,
	"height_px" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "template_assets_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "template_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "material_class" "material_class" DEFAULT 'PAPER' NOT NULL;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "blank_object_id" uuid;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "print_quad" jsonb;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "mask_object_id" uuid;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "lighting_object_id" uuid;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "texture_object_id" uuid;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "displacement_object_id" uuid;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "displacement_amp_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "displacement_amp_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "map_resolution_px" integer DEFAULT 1500 NOT NULL;--> statement-breakpoint
ALTER TABLE "print_templates" ADD COLUMN "icc_profile" text DEFAULT 'srgb' NOT NULL;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_blank_object_id_template_assets_id_fk" FOREIGN KEY ("blank_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_mask_object_id_template_assets_id_fk" FOREIGN KEY ("mask_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_lighting_object_id_template_assets_id_fk" FOREIGN KEY ("lighting_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_texture_object_id_template_assets_id_fk" FOREIGN KEY ("texture_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "print_templates" ADD CONSTRAINT "print_templates_displacement_object_id_template_assets_id_fk" FOREIGN KEY ("displacement_object_id") REFERENCES "public"."template_assets"("id") ON DELETE set null ON UPDATE no action;