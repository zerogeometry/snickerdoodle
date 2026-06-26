CREATE TYPE "public"."access_level" AS ENUM('VIEW', 'VIEW_BUY', 'CONTRIBUTE');--> statement-breakpoint
CREATE TYPE "public"."actor_type" AS ENUM('MEMBER', 'GUEST', 'ANON', 'ADMIN', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."asset_kind" AS ENUM('DRAWING', 'PHOTO');--> statement-breakpoint
CREATE TYPE "public"."audit_event" AS ENUM('INVITE_SENT', 'INVITE_ACCEPTED', 'INVITE_REVOKED', 'MEMBERSHIP_CREATED', 'MEMBERSHIP_ACCESS_CHANGED', 'MEMBERSHIP_CIRCLE_CHANGED', 'MEMBER_REMOVED', 'MEMBER_LEFT', 'ASSET_VISIBILITY_CHANGED', 'ASSET_DELETED', 'ACCOUNT_CLOSED', 'GIFT_LINK_CREATED', 'GIFT_LINK_REVOKED', 'GIFT_LINK_EXPIRED', 'CONSENT_CHANGED', 'PROVIDER_DELETION_REQUESTED', 'PROVIDER_DELETION_CONFIRMED', 'PURGE_EXECUTED', 'RIGHTS_REQUEST_RECEIVED', 'RIGHTS_REQUEST_COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."family_circle" AS ENUM('FAMILY', 'EXTENDED');--> statement-breakpoint
CREATE TYPE "public"."consent_basis" AS ENUM('CONSENT', 'SOFT_OPT_IN');--> statement-breakpoint
CREATE TYPE "public"."consent_channel" AS ENUM('EMAIL', 'SMS');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('MARKETING', 'REMINDERS');--> statement-breakpoint
CREATE TYPE "public"."consent_status" AS ENUM('GRANTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "public"."invite_status" AS ENUM('PENDING', 'VERIFIED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."membership_status" AS ENUM('ACTIVE', 'REMOVED', 'LEFT');--> statement-breakpoint
CREATE TYPE "public"."object_class" AS ENUM('ORIGINAL', 'DERIVATIVE', 'CREATION_LAYER');--> statement-breakpoint
CREATE TYPE "public"."relationship" AS ENUM('CHILD', 'PARENT', 'GRANDPARENT', 'AUNT_UNCLE', 'CLOSE_FRIEND', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."rights_req_status" AS ENUM('RECEIVED', 'CLOCK_PAUSED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED');--> statement-breakpoint
CREATE TYPE "public"."rights_req_type" AS ENUM('ACCESS', 'RECTIFICATION', 'ERASURE', 'RESTRICTION', 'OBJECTION', 'PORTABILITY', 'COMPLAINT');--> statement-breakpoint
CREATE TYPE "public"."sub_processor_role" AS ENUM('HOSTING', 'DB', 'STORAGE', 'AI_GENERATIVE', 'POD', 'PAYMENTS', 'EMAIL_SMS', 'ANALYTICS');--> statement-breakpoint
CREATE TYPE "public"."visibility_tier" AS ENUM('ONLY_ME', 'FAMILY', 'EXTENDED');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text,
	"email_verified_at" timestamp with time zone,
	"display_name" text,
	"is_admin" boolean DEFAULT false NOT NULL,
	"mfa_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"uploader_account_id" uuid NOT NULL,
	"child_subject_id" uuid,
	"controller_account_id" uuid NOT NULL,
	"visibility" "visibility_tier" DEFAULT 'FAMILY' NOT NULL,
	"kept_in_home" boolean DEFAULT false NOT NULL,
	"fulfilled_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid,
	"actor_account_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"event" "audit_event" NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "children" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"first_name" text NOT NULL,
	"birthday" date,
	"avatar_asset_id" uuid,
	"controller_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"channel" "consent_channel" NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"status" "consent_status" NOT NULL,
	"basis" "consent_basis" NOT NULL,
	"source" text,
	"evidence" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "families" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"display_name" text NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"created_by_account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"relationship" "relationship" NOT NULL,
	"circle" "family_circle" NOT NULL,
	"access_level" "access_level" NOT NULL,
	"token" text NOT NULL,
	"status" "invite_status" DEFAULT 'PENDING' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"family_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"relationship" "relationship" NOT NULL,
	"circle" "family_circle" NOT NULL,
	"access_level" "access_level" NOT NULL,
	"status" "membership_status" DEFAULT 'ACTIVE' NOT NULL,
	"is_owner" boolean DEFAULT false NOT NULL,
	"invite_id" uuid,
	"joined_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_owner_or_invite" CHECK ("memberships"."is_owner" OR "memberships"."invite_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "rights_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_account_id" uuid,
	"subject_email" text,
	"type" "rights_req_type" NOT NULL,
	"status" "rights_req_status" DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"clock_paused_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"outcome" text,
	"export_object_id" uuid,
	"complaint_ack_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_objects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"asset_id" uuid NOT NULL,
	"object_class" "object_class" NOT NULL,
	"bucket" text NOT NULL,
	"key" text NOT NULL,
	"content_type" text,
	"byte_size" bigint,
	"sha256" text,
	"kms_key_alias" text,
	"write_once" boolean DEFAULT false NOT NULL,
	"exif_stripped" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_processors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"role" "sub_processor_role" NOT NULL,
	"region" text,
	"dpa_signed_at" timestamp with time zone,
	"transfer_mechanism" text,
	"no_training_attested" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_uploader_account_id_accounts_id_fk" FOREIGN KEY ("uploader_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_child_subject_id_children_id_fk" FOREIGN KEY ("child_subject_id") REFERENCES "public"."children"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_controller_account_id_accounts_id_fk" FOREIGN KEY ("controller_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_avatar_asset_id_assets_id_fk" FOREIGN KEY ("avatar_asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "children" ADD CONSTRAINT "children_controller_account_id_accounts_id_fk" FOREIGN KEY ("controller_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "families" ADD CONSTRAINT "families_owner_account_id_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_account_id_accounts_id_fk" FOREIGN KEY ("created_by_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_family_id_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_invite_id_invites_id_fk" FOREIGN KEY ("invite_id") REFERENCES "public"."invites"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_requests" ADD CONSTRAINT "rights_requests_subject_account_id_accounts_id_fk" FOREIGN KEY ("subject_account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rights_requests" ADD CONSTRAINT "rights_requests_export_object_id_storage_objects_id_fk" FOREIGN KEY ("export_object_id") REFERENCES "public"."storage_objects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_objects" ADD CONSTRAINT "storage_objects_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_email_unique" ON "accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "asset_family_child_visibility_idx" ON "assets" USING btree ("family_id","child_subject_id","visibility");--> statement-breakpoint
CREATE INDEX "audit_family_time_idx" ON "audit_records" USING btree ("family_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_time_idx" ON "audit_records" USING btree ("event","created_at");--> statement-breakpoint
CREATE INDEX "consent_lookup_idx" ON "consent_records" USING btree ("account_id","channel","purpose","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_active_unique" ON "memberships" USING btree ("family_id","account_id") WHERE "memberships"."status" = 'ACTIVE';--> statement-breakpoint
CREATE INDEX "membership_family_status_idx" ON "memberships" USING btree ("family_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_one_original_per_asset" ON "storage_objects" USING btree ("asset_id") WHERE "storage_objects"."object_class" = 'ORIGINAL';--> statement-breakpoint
CREATE INDEX "storage_asset_idx" ON "storage_objects" USING btree ("asset_id");--> statement-breakpoint
-- audit_records is APPEND-ONLY (docs/05): block UPDATE and DELETE at the DB level,
-- so the audit trail is tamper-evident evidence of the control-based trust model.
CREATE OR REPLACE FUNCTION audit_records_append_only() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_records is append-only (% is not permitted)', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_records_no_update BEFORE UPDATE ON "audit_records" FOR EACH ROW EXECUTE FUNCTION audit_records_append_only();--> statement-breakpoint
CREATE TRIGGER audit_records_no_delete BEFORE DELETE ON "audit_records" FOR EACH ROW EXECUTE FUNCTION audit_records_append_only();