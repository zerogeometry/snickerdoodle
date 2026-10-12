ALTER TABLE "invites" ADD COLUMN "share_occasions" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "sees_occasions" boolean DEFAULT false NOT NULL;