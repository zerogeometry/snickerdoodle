CREATE TYPE "public"."support_request_status" AS ENUM('OPEN', 'ANSWERED', 'CLOSED');--> statement-breakpoint
CREATE TABLE "support_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" text NOT NULL,
	"topic" text NOT NULL,
	"account_id" uuid,
	"email" text NOT NULL,
	"name" text,
	"order_ref" text,
	"message" text NOT NULL,
	"status" "support_request_status" DEFAULT 'OPEN' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ack_sent_at" timestamp with time zone,
	"team_notified_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "support_requests_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
ALTER TABLE "support_requests" ADD CONSTRAINT "support_requests_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "support_requests_received_idx" ON "support_requests" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "support_requests_email_idx" ON "support_requests" USING btree ("email");