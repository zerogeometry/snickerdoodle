CREATE TYPE "public"."occasion_whose" AS ENUM('OURS', 'SOMEONE_ELSE');--> statement-breakpoint
ALTER TYPE "public"."family_circle" ADD VALUE 'HOME' BEFORE 'FAMILY';--> statement-breakpoint
ALTER TYPE "public"."relationship" ADD VALUE 'ADULT_CHILD';--> statement-breakpoint
ALTER TYPE "public"."visibility_tier" ADD VALUE 'HOME' BEFORE 'FAMILY';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "parent_limit" "visibility_tier";--> statement-breakpoint
ALTER TABLE "gift_links" ADD COLUMN "recipient_email" text;--> statement-breakpoint
ALTER TABLE "gift_links" ADD COLUMN "recipient_account_id" uuid;--> statement-breakpoint
ALTER TABLE "gift_links" ADD COLUMN "audience_circle" "family_circle";--> statement-breakpoint
ALTER TABLE "gift_links" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "invites" ADD COLUMN "membership_id" uuid;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "join_consent_version" text;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "join_consented_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "occasions" ADD COLUMN "whose" "occasion_whose" DEFAULT 'OURS' NOT NULL;--> statement-breakpoint
ALTER TABLE "gift_links" ADD CONSTRAINT "gift_links_recipient_account_id_accounts_id_fk" FOREIGN KEY ("recipient_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- D27 (founder, 10 Nov 2026) — existing data moves to the PRIVATE side only. (The new enum values above can't be
-- used in this same transaction, so nothing below mentions HOME / ADULT_CHILD.)
-- 1. A little one's keepsake a relative added: the parent's current setting becomes their ceiling, so the relative
--    (who now chooses) can narrow it but never widen past what the parent chose.
UPDATE "assets" SET "parent_limit" = "visibility"
 WHERE "child_subject_id" IS NOT NULL AND "uploader_account_id" IS NOT NULL AND "uploader_account_id" <> "controller_account_id";--> statement-breakpoint
-- 2. Occasions: a little one's day, a day someone added for themselves, or one for the family leader or a parent
--    in the family stays "ours"; everything else is "someone else's" (home only — authz holds it there).
UPDATE "occasions" o SET "whose" = 'SOMEONE_ELSE'
 WHERE o."child_id" IS NULL
   AND (o."member_account_id" IS NULL OR o."member_account_id" <> o."created_by_account_id")
   AND NOT EXISTS (SELECT 1 FROM "families" f WHERE f."id" = o."family_id" AND f."owner_account_id" = o."member_account_id")
   AND NOT EXISTS (SELECT 1 FROM "memberships" m WHERE m."family_id" = o."family_id" AND m."account_id" = o."member_account_id"
                   AND m."status" = 'ACTIVE' AND m."relationship" = 'PARENT');
