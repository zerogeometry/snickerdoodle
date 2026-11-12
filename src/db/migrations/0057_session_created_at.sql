ALTER TABLE "sessions" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- sessions from before this change count as old sign-ins, so widening asks for a fresh one (A-63)
UPDATE "sessions" SET "created_at" = '1970-01-01T00:00:00Z';
