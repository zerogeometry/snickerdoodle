ALTER TYPE "public"."audit_event" ADD VALUE IF NOT EXISTS 'ADMIN_PERSONAL_DATA_VIEWED';--> statement-breakpoint
CREATE TABLE "ops_alerts" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"emailed_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"handled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ops_status" (
	"key" text PRIMARY KEY NOT NULL,
	"ok" boolean NOT NULL,
	"summary" jsonb,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "stripe_payment_intent" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_pence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "dispute" jsonb;