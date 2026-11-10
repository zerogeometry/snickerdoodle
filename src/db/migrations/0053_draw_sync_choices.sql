CREATE TYPE "public"."app_sync_keepsakes" AS ENUM('none', 'proud', 'all');--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'APP_PROGRESS_DELETED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'OCCASION_CHANGED';--> statement-breakpoint
CREATE TABLE "app_artist_progress" (
	"child_id" uuid PRIMARY KEY NOT NULL,
	"family_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_auth_codes" ADD COLUMN "sync_keepsakes" "app_sync_keepsakes";--> statement-breakpoint
ALTER TABLE "app_auth_codes" ADD COLUMN "sync_children" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_auth_codes" ADD COLUMN "sync_progress" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_auth_codes" ADD COLUMN "sync_birthdays" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD COLUMN "sync_keepsakes" "app_sync_keepsakes" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD COLUMN "sync_children" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD COLUMN "sync_progress" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD COLUMN "sync_birthdays" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD COLUMN "sync_chosen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "app_client_ref" text;--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "relation" text;--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app_artist_progress" ADD CONSTRAINT "app_artist_progress_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_artist_progress" ADD CONSTRAINT "app_artist_progress_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_family_app_client_ref_unique" ON "assets" USING btree ("family_id","app_client_ref") WHERE "assets"."app_client_ref" IS NOT NULL;--> statement-breakpoint
UPDATE "occasions" SET "updated_at" = "created_at";