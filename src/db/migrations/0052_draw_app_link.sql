CREATE TYPE "public"."asset_source" AS ENUM('web', 'app-screen', 'app-paper');--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'APP_LINKED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'APP_UNLINKED';--> statement-breakpoint
CREATE TABLE "app_auth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"family_id" uuid,
	"child_ids" jsonb,
	"code_challenge" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_auth_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "app_checkout_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"app_token_id" uuid,
	"account_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"product_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_checkout_grants_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "app_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_hash" text NOT NULL,
	"account_id" uuid NOT NULL,
	"family_id" uuid NOT NULL,
	"child_ids" jsonb,
	"device_label" text NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "source" "asset_source" DEFAULT 'web' NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "made_on" date;--> statement-breakpoint
ALTER TABLE "app_auth_codes" ADD CONSTRAINT "app_auth_codes_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_auth_codes" ADD CONSTRAINT "app_auth_codes_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_checkout_grants" ADD CONSTRAINT "app_checkout_grants_app_token_id_app_tokens_id_fk" FOREIGN KEY ("app_token_id") REFERENCES "public"."app_tokens"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_checkout_grants" ADD CONSTRAINT "app_checkout_grants_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_checkout_grants" ADD CONSTRAINT "app_checkout_grants_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_checkout_grants" ADD CONSTRAINT "app_checkout_grants_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_tokens" ADD CONSTRAINT "app_tokens_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_token_account_family_idx" ON "app_tokens" USING btree ("account_id","family_id");