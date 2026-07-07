CREATE TYPE "public"."agent_audit_event" AS ENUM('permission_granted', 'permission_updated', 'permission_revoked', 'kill_switch_activated', 'anomaly_flagged');--> statement-breakpoint
CREATE TYPE "public"."agent_review_status" AS ENUM('pending', 'reviewed');--> statement-breakpoint
CREATE TYPE "public"."kyc_status" AS ENUM('verified', 'rejected');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_type" "agent_audit_event" NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"max_transaction_usd" numeric NOT NULL,
	"approved_recipients" jsonb DEFAULT '[]' NOT NULL,
	"approved_corridors" jsonb DEFAULT '[]' NOT NULL,
	"max_tx_per_day" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"revoked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_permissions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "agent_review_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"detail" jsonb,
	"status" "agent_review_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "date_of_birth" date;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_type" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "id_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_status" "kyc_status";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_rejection_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "kyc_submitted_at" timestamp;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_audit_log" ADD CONSTRAINT "agent_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_review_events" ADD CONSTRAINT "agent_review_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_user_id_idx" ON "agent_audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_audit_log_created_at_idx" ON "agent_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_permissions_user_id_idx" ON "agent_permissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_review_events_user_id_idx" ON "agent_review_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_review_events_status_idx" ON "agent_review_events" USING btree ("status");