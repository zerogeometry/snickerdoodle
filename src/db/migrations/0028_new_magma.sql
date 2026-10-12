CREATE TABLE "saved_designs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"variant_sku" text NOT NULL,
	"transform" jsonb,
	"source_object_id" uuid,
	"back" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "saved_designs" ADD CONSTRAINT "saved_designs_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_designs" ADD CONSTRAINT "saved_designs_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_designs" ADD CONSTRAINT "saved_designs_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_design_family_idx" ON "saved_designs" USING btree ("family_id","created_at");