CREATE TYPE "public"."ml_op" AS ENUM('BG_REMOVE', 'UPSCALE');--> statement-breakpoint
CREATE TABLE "ml_operations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"op" "ml_op" NOT NULL,
	"asset_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ml_operations" ADD CONSTRAINT "ml_operations_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ml_operations" ADD CONSTRAINT "ml_operations_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ml_op_account_time_idx" ON "ml_operations" USING btree ("account_id","created_at");