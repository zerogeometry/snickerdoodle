CREATE TYPE "public"."lunar_calendar" AS ENUM('CHINESE', 'KOREAN');--> statement-breakpoint
CREATE TYPE "public"."occasion_kind" AS ENUM('BIRTHDAY', 'ANNIVERSARY', 'MILESTONE', 'OTHER');--> statement-breakpoint
CREATE TABLE "occasions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" "occasion_kind" NOT NULL,
	"month" integer NOT NULL,
	"day" integer NOT NULL,
	"year" integer,
	"lunar" "lunar_calendar",
	"child_id" uuid,
	"member_account_id" uuid,
	"share_circle" "family_circle" DEFAULT 'FAMILY' NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "occasion_date_ok" CHECK ("occasions"."month" BETWEEN 1 AND 12 AND "occasions"."day" BETWEEN 1 AND 31),
	CONSTRAINT "occasion_lunar_needs_year" CHECK ("occasions"."lunar" IS NULL OR "occasions"."year" IS NOT NULL)
);
--> statement-breakpoint
DROP INDEX "reminder_once_per_occasion";--> statement-breakpoint
ALTER TABLE "reminder_sends" ALTER COLUMN "child_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "children" ADD COLUMN "birthday_lunar" "lunar_calendar";--> statement-breakpoint
ALTER TABLE "families" ADD COLUMN "celebrate" jsonb DEFAULT '["everyday","christmas"]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD COLUMN "occasion_key" text;--> statement-breakpoint
UPDATE "reminder_sends" SET "occasion_key" = 'child:' || "child_id" WHERE "occasion_key" IS NULL;--> statement-breakpoint
ALTER TABLE "reminder_sends" ALTER COLUMN "occasion_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD COLUMN "offset_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_child_id_children_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."children"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_member_account_id_accounts_id_fk" FOREIGN KEY ("member_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "occasions" ADD CONSTRAINT "occasions_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "occasions_family_idx" ON "occasions" USING btree ("family_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_once_per_occasion_nudge" ON "reminder_sends" USING btree ("account_id","occasion_key","occasion_year","offset_days");