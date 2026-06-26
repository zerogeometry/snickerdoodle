CREATE TYPE "public"."gift_link_status" AS ENUM('ACTIVE', 'REVOKED', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "gift_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"token" text NOT NULL,
	"title" text,
	"items" jsonb NOT NULL,
	"invite_id" uuid,
	"status" "gift_link_status" DEFAULT 'ACTIVE' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "gift_links" ADD CONSTRAINT "gift_links_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_links" ADD CONSTRAINT "gift_links_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_links" ADD CONSTRAINT "gift_links_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_link_family_idx" ON "gift_links" USING btree ("family_id");