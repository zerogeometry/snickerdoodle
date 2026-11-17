-- "sign in with Face ID" (passkeys, founder 17 Nov 2026): the public keys people's own devices make, the one-time
-- challenges they sign, and how each sign-in happened. Additive only — the email sign-in is untouched.
-- drizzle-kit runs every pending migration in ONE transaction: the two new audit_event values are only ADDED here,
-- never used, so this is safe there (Postgres can't use a new enum value in the transaction that added it).
ALTER TYPE "public"."audit_event" ADD VALUE 'PASSKEY_ADDED';--> statement-breakpoint
ALTER TYPE "public"."audit_event" ADD VALUE 'PASSKEY_REMOVED';--> statement-breakpoint
CREATE TABLE "passkey_challenges" (
	"challenge" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"account_id" uuid,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "passkeys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"credential_id" text NOT NULL,
	"public_key" text NOT NULL,
	"counter" bigint DEFAULT 0 NOT NULL,
	"transports" jsonb,
	"device_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "sign_in_method" text DEFAULT 'email' NOT NULL;--> statement-breakpoint
ALTER TABLE "passkey_challenges" ADD CONSTRAINT "passkey_challenges_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "passkeys" ADD CONSTRAINT "passkeys_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "passkey_challenge_expires_idx" ON "passkey_challenges" USING btree ("expires");--> statement-breakpoint
CREATE UNIQUE INDEX "passkey_credential_unique" ON "passkeys" USING btree ("credential_id");--> statement-breakpoint
CREATE INDEX "passkey_account_idx" ON "passkeys" USING btree ("account_id");