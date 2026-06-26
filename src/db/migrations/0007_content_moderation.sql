CREATE TYPE "public"."moderation_status" AS ENUM('PENDING', 'CLEAR', 'FLAGGED', 'BLOCKED');--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'CONTENT_FLAGGED' BEFORE 'ACCOUNT_CLOSED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'CONTENT_BLOCKED' BEFORE 'ACCOUNT_CLOSED';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "moderation_status" "moderation_status" DEFAULT 'PENDING' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "moderated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "moderation_detail" jsonb;