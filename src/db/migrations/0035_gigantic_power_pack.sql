CREATE TYPE "public"."profile_image_kind" AS ENUM('AVATAR', 'ACCOUNT_HEADER', 'FAMILY_BANNER');--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'PROFILE_UPDATED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'EMAIL_CHANGED';--> statement-breakpoint
CREATE TABLE "email_change_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"new_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_change_requests_account_id_unique" UNIQUE("account_id"),
	CONSTRAINT "email_change_requests_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "profile_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "profile_image_kind" NOT NULL,
	"account_id" uuid NOT NULL,
	"family_id" uuid,
	"key" text NOT NULL,
	"content_type" text NOT NULL,
	"width" integer,
	"height" integer,
	"byte_size" integer,
	"moderation_status" "moderation_status" DEFAULT 'PENDING' NOT NULL,
	"moderated_at" timestamp with time zone,
	"moderation_detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_images_key_unique" UNIQUE("key"),
	CONSTRAINT "profile_image_banner_has_family" CHECK (("profile_images"."kind" = 'FAMILY_BANNER') = ("profile_images"."family_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "email_change_requests" ADD CONSTRAINT "email_change_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_images" ADD CONSTRAINT "profile_images_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile_images" ADD CONSTRAINT "profile_images_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_image_one_per_account_kind" ON "profile_images" USING btree ("account_id","kind") WHERE "profile_images"."kind" <> 'FAMILY_BANNER';--> statement-breakpoint
CREATE UNIQUE INDEX "profile_image_one_banner_per_family" ON "profile_images" USING btree ("family_id") WHERE "profile_images"."kind" = 'FAMILY_BANNER';