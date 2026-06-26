ALTER TABLE "assets" ALTER COLUMN "family_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "uploader_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ALTER COLUMN "controller_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "ephemeral_claim_id" uuid;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_ephemeral_claim_id_unique" UNIQUE("ephemeral_claim_id");--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "asset_owned_or_ephemeral" CHECK (("assets"."ephemeral_claim_id" IS NOT NULL) OR ("assets"."family_id" IS NOT NULL AND "assets"."controller_account_id" IS NOT NULL));