ALTER TYPE "public"."audit_event" ADD VALUE 'FAMILY_HANDED_OVER';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'KEEP_CHOICE_MADE';--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "keep_declined_at" timestamp with time zone;