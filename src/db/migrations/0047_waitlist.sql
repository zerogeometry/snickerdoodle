CREATE TABLE "waitlist_signups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"confirm_token_hash" text,
	"confirm_token_expires_at" timestamp with time zone,
	"confirm_sent_at" timestamp with time zone,
	"consent_version" text NOT NULL,
	"unsubscribe_token" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "consent_records" ALTER COLUMN "account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "consent_records" ADD COLUMN "waitlist_signup_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_email_unique" ON "waitlist_signups" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_unsubscribe_token_unique" ON "waitlist_signups" USING btree ("unsubscribe_token");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_confirm_token_unique" ON "waitlist_signups" USING btree ("confirm_token_hash");--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_waitlist_signup_id_waitlist_signups_id_fk" FOREIGN KEY ("waitlist_signup_id") REFERENCES "public"."waitlist_signups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consent_waitlist_idx" ON "consent_records" USING btree ("waitlist_signup_id","created_at");--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_one_subject" CHECK (num_nonnulls("consent_records"."account_id", "consent_records"."waitlist_signup_id") = 1);